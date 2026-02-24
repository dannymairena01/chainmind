import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { agentQueue } from "../queue/worker";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

export const agentsRouter: Router = Router();
const prisma = new PrismaClient();

// GET /agents?ownerId=... — fetch all agents belonging to the authenticated user
agentsRouter.get(
    "/",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            // Securely extract the ownerId directly from the verified token
            const ownerId = req.user?.walletAddress;

            if (!ownerId) {
                res.status(401).json({ error: "Unauthorized access token" });
                return;
            }

            const agents = await prisma.agent.findMany({
                where: { ownerId },
                orderBy: { createdAt: "desc" },
            });

            res.status(200).json({ agents });
        } catch (err) {
            console.error("[GET /agents]", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

// POST /agents — create a new agent
agentsRouter.post(
    "/",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const { name, taskType } = req.body as {
                name: string;
                taskType: string;
            };

            // Securely extract the ownerId directly from the verified token
            const ownerId = req.user?.walletAddress;

            if (!ownerId) {
                res.status(401).json({ error: "Unauthorized access token" });
                return;
            }

            if (!name || !taskType) {
                res.status(400).json({ error: "name and taskType are required" });
                return;
            }

            // Persist agent record in PostgreSQL
            const newAgent = await prisma.agent.create({
                data: { ownerId, name, taskType },
            });

            // Queue the first agent job for background execution
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
    });

// GET /agents/:id — return specific agent details (strictly verified by ownership)
agentsRouter.get(
    "/:id",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params as { id: string };
            const ownerId = req.user?.walletAddress;

            if (!ownerId) {
                res.status(401).json({ error: "Unauthorized access token" });
                return;
            }

            const agent = await prisma.agent.findUnique({
                where: { id },
            });

            if (!agent) {
                res.status(404).json({ error: "Agent not found" });
                return;
            }

            // Authorization: Ensure the requester actually owns this agent
            if (agent.ownerId !== ownerId) {
                res.status(403).json({ error: "Forbidden: You do not own this agent" });
                return;
            }

            // TODO: look up on-chain attestations/recent activity
            res.status(200).json({
                agentId: agent.id,
                status: agent.status,
                name: agent.name,
                taskType: agent.taskType,
                walletAddress: agent.walletAddress,
                recentActivity: [],
            });
        } catch (err) {
            console.error("[GET /agents/:id]", err);
            res.status(500).json({ error: "Internal server error" });
        }
    });

// DELETE /agents/:id — securely delete an agent
agentsRouter.delete(
    "/:id",
    requireAuth as (req: Request, res: Response, next: NextFunction) => void,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params as { id: string };
            const ownerId = req.user?.walletAddress;

            if (!ownerId) {
                res.status(401).json({ error: "Unauthorized access token" });
                return;
            }

            const agent = await prisma.agent.findUnique({
                where: { id },
            });

            if (!agent) {
                res.status(404).json({ error: "Agent not found" });
                return;
            }

            // Authorization: Ensure the requester actually owns this agent
            if (agent.ownerId !== ownerId) {
                res.status(403).json({ error: "Forbidden: You do not own this agent" });
                return;
            }

            await prisma.agent.delete({
                where: { id },
            });

            res.status(200).json({ success: true, message: "Agent deleted successfully" });
        } catch (err) {
            console.error("[DELETE /agents/:id]", err);
            res.status(500).json({ error: "Internal server error" });
        }
    });
