import { Router, Request, Response } from "express";
import { agentQueue } from "../queue/worker";

export const agentsRouter = Router();

// POST /agents — create a new agent, provision wallet, queue first job
agentsRouter.post("/", async (req: Request, res: Response): Promise<void> => {
    try {
        const { ownerId, name, taskType } = req.body as {
            ownerId: string;
            name: string;
            taskType: string;
        };

        if (!ownerId || !name || !taskType) {
            res.status(400).json({ error: "ownerId, name, and taskType are required" });
            return;
        }

        // TODO: provision AgentKit wallet → register in AgentRegistry → persist agent record
        const agentId = `agent_${Date.now()}`;

        // Queue the first agent job
        await agentQueue.add(
            "run-agent",
            { agentId, ownerId, taskType },
            { attempts: 3, backoff: { type: "exponential", delay: 1000 } }
        );

        res.status(201).json({
            agentId,
            message: "Agent created and first job queued",
        });
    } catch (err) {
        console.error("[POST /agents]", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// GET /agents/:id — return agent status and recent activity
agentsRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };

        // TODO: look up agent from DB, fetch on-chain attestations
        res.status(200).json({
            agentId: id,
            status: "idle",
            recentActivity: [],
        });
    } catch (err) {
        console.error("[GET /agents/:id]", err);
        res.status(500).json({ error: "Internal server error" });
    }
});
