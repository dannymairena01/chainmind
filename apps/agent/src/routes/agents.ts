import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { z, ZodError } from "zod";
import { ethers } from "ethers";
import { agentQueue } from "../queue/worker";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { fetchAttestations } from "../lib/eas";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const agentsRouter: Router = Router();
const prisma = new PrismaClient();

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateAgentSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name must be 100 chars or less").trim(),
    taskType: z.enum(["SWAP", "MONITOR", "ALERT"], {
        errorMap: () => ({ message: "taskType must be one of: SWAP, MONITOR, ALERT" }),
    }),
    description: z.string().max(500).optional(),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function handleZodError(err: ZodError, res: Response): void {
    res.status(400).json({
        error: "Validation failed",
        errors: err.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
    });
}

// ─── GET /agents — list all agents for the authenticated user ─────────────────

agentsRouter.get(
    "/",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const ownerId = req.user?.privyUserId;
            const take = parseInt((req.query.take as string) || "20", 10);
            const skip = parseInt((req.query.skip as string) || "0", 10);

            if (!ownerId) { res.status(401).json({ error: "Unauthorized access token" }); return; }

            const agents = await prisma.agent.findMany({
                where: { ownerId },
                orderBy: { createdAt: "desc" },
                take,
                skip,
            });

            res.status(200).json({ agents });
        } catch (err) {
            console.error("[GET /agents]", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

// ─── POST /agents — create a new agent (Zod-validated) ───────────────────────

const createAgentLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 5, // Limit each user to 5 agent creations per hour
    message: { error: "Too many agents created. Please try again later." },
    keyGenerator: (req: Request) => {
        const authReq = req as AuthenticatedRequest;
        // Use the authenticated Privy user ID as the key; fall back to IPv6-safe IP
        return authReq.user?.privyUserId || ipKeyGenerator(req.ip ?? "");
    }
});

agentsRouter.post(
    "/",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    createAgentLimiter,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const ownerId = req.user?.privyUserId;
            if (!ownerId) { res.status(401).json({ error: "Unauthorized access token" }); return; }

            const parsed = CreateAgentSchema.safeParse(req.body);
            if (!parsed.success) { handleZodError(parsed.error, res); return; }

            const { name, taskType, description } = parsed.data;

            const newAgent = await prisma.agent.create({
                data: { ownerId, name, taskType, description },
            });

            await agentQueue.add(
                "run-agent",
                { agentId: newAgent.id, ownerId, taskType },
                { attempts: 3, backoff: { type: "exponential", delay: 1000 } }
            );

            res.status(201).json({
                agentId: newAgent.id,
                message: "Agent created and first job queued",
            });
        } catch (err) {
            console.error("[POST /agents]", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

// ─── GET /agents/:id — agent detail + real EAS attestations ──────────────────

agentsRouter.get(
    "/:id",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params as { id: string };
            const ownerId = req.user?.privyUserId;
            const take = parseInt((req.query.take as string) || "20", 10);
            const skip = parseInt((req.query.skip as string) || "0", 10);

            if (!ownerId) { res.status(401).json({ error: "Unauthorized access token" }); return; }

            const agent = await prisma.agent.findUnique({ where: { id } });
            if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
            if (agent.ownerId !== ownerId) { res.status(403).json({ error: "Forbidden: You do not own this agent" }); return; }

            // Fetch real on-chain attestations from EAS GraphQL API
            const recentActivity = agent.walletAddress
                ? await fetchAttestations(agent.walletAddress, take, skip)
                : [];

            // Fetch real ETH balance from Alchemy RPC
            let balance = "0";
            if (agent.walletAddress) {
                try {
                    const provider = new ethers.JsonRpcProvider(
                        process.env["BASE_SEPOLIA_RPC_URL"] ?? "https://sepolia.base.org"
                    );
                    const rawBalance = await provider.getBalance(agent.walletAddress);
                    balance = parseFloat(ethers.formatEther(rawBalance)).toFixed(4);
                } catch {
                    // Non-fatal: balance stays "0" if RPC unavailable
                }
            }

            res.status(200).json({
                agentId: agent.id,
                status: agent.status,
                name: agent.name,
                taskType: agent.taskType,
                walletAddress: agent.walletAddress,
                lastAction: agent.lastAction,
                balance,
                recentActivity,
            });
        } catch (err) {
            console.error("[GET /agents/:id]", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

// ─── DELETE /agents/:id ───────────────────────────────────────────────────────

agentsRouter.delete(
    "/:id",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params as { id: string };
            const ownerId = req.user?.privyUserId;
            if (!ownerId) { res.status(401).json({ error: "Unauthorized access token" }); return; }

            const agent = await prisma.agent.findUnique({ where: { id } });
            if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
            if (agent.ownerId !== ownerId) { res.status(403).json({ error: "Forbidden: You do not own this agent" }); return; }
            await prisma.agent.delete({ where: { id } });

            // Remove any pending/active/delayed BullMQ jobs for this agent to prevent DLQ pollution
            try {
                const jobs = await agentQueue.getJobs(["waiting", "active", "delayed", "paused"]);
                const agentJobs = jobs.filter((job: any) => job.data && job.data.agentId === id);

                for (const job of agentJobs) {
                    await job.remove();
                }
                console.log(`[DELETE /agents/:id] Removed ${agentJobs.length} pending jobs for agent ${id}`);
            } catch (jobErr) {
                console.warn(`[DELETE /agents/:id] Failed to clean up BullMQ jobs for agent ${id}:`, jobErr);
            }

            res.status(200).json({ success: true, message: "Agent deleted successfully" });
        } catch (err) {
            console.error("[DELETE /agents/:id]", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

// ─── POST /agents/:id/run — manually trigger a new job for an existing agent ──

agentsRouter.post(
    "/:id/run",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params as { id: string };
            const ownerId = req.user?.privyUserId;
            if (!ownerId) { res.status(401).json({ error: "Unauthorized access token" }); return; }

            const agent = await prisma.agent.findUnique({ where: { id } });
            if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
            if (agent.ownerId !== ownerId) { res.status(403).json({ error: "Forbidden" }); return; }
            if (agent.status === "active") { res.status(409).json({ error: "Agent is already running" }); return; }

            await agentQueue.add(
                "run-agent",
                { agentId: agent.id, ownerId, taskType: agent.taskType },
                { attempts: 3, backoff: { type: "exponential", delay: 1000 } }
            );

            res.status(202).json({ message: "Job queued successfully" });
        } catch (err) {
            console.error("[POST /agents/:id/run]", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);
