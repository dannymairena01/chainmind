import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../index";
import { prisma } from "../lib/prisma";
import { agentQueue } from "../queue/worker";

describe("Agent API Endpoints", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── POST /agents ──────────────────────────────────────────────────────────

    describe("POST /agents", () => {
        it("successfully creates & persists an agent and enqueues the BullMQ job", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "0x123",
                name: "Test Agent",
                taskType: "MONITOR",
                description: null,
                status: "idle",
                walletAddress: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            (prisma.agent.create as any).mockResolvedValue(mockAgent);

            const res = await request(app)
                .post("/agents")
                .set("Authorization", "Bearer mock-token")
                .send({
                    name: "Test Agent",
                    taskType: "MONITOR",
                });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({
                agentId: mockAgent.id,
                message: "Agent created and first job queued",
            });

            expect(prisma.agent.create).toHaveBeenCalledWith({
                data: {
                    ownerId: "0x123",
                    name: "Test Agent",
                    taskType: "MONITOR",
                },
            });

            expect(agentQueue.add).toHaveBeenCalledWith(
                "run-agent",
                { agentId: mockAgent.id, ownerId: "0x123", taskType: "MONITOR" },
                expect.any(Object)
            );
        });

        it("returns 400 on invalid input", async () => {
            const res = await request(app)
                .post("/agents")
                .set("Authorization", "Bearer mock-token")
                .send({
                    name: "Incomplete Agent", // Missing taskType
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Validation failed");
            expect(res.body.errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        field: "taskType",
                        message: "taskType must be one of: SWAP, MONITOR, ALERT",
                    }),
                ])
            );
            expect(prisma.agent.create).not.toHaveBeenCalled();
            expect(agentQueue.add).not.toHaveBeenCalled();
        });

        it("returns 401 if missing auth token", async () => {
            const res = await request(app).post("/agents").send({ name: "X", taskType: "SWAP" });
            expect(res.status).toBe(401);
        });
    });

    // ─── GET /agents ──────────────────────────────────────────────────────────

    describe("GET /agents", () => {
        it("fetches all agents for a user", async () => {
            const mockAgents = [
                { id: "agent_1", name: "Agent 1", taskType: "MONITOR" },
                { id: "agent_2", name: "Agent 2", taskType: "SWAP" },
            ];

            (prisma.agent.findMany as any).mockResolvedValue(mockAgents);

            const res = await request(app)
                .get("/agents")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(200);
            expect(res.body.agents).toHaveLength(2);
            expect(prisma.agent.findMany).toHaveBeenCalledWith({
                where: { ownerId: "0x123" },
                orderBy: { createdAt: "desc" },
                take: 20,
                skip: 0,
            });
        });

        it("returns 401 if missing auth token", async () => {
            const res = await request(app).get("/agents");
            expect(res.status).toBe(401);
            expect(res.body.error).toBe("Unauthorized access token");
        });
    });

    // ─── GET /agents/:id ──────────────────────────────────────────────────────

    describe("GET /agents/:id", () => {
        it("fetches an existing agent owned by the requester", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "0x123",
                name: "Test Agent",
                taskType: "MONITOR",
                status: "idle",
                walletAddress: null,
            };

            (prisma.agent.findUnique as any).mockResolvedValue(mockAgent);

            const res = await request(app)
                .get("/agents/agent_123")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(200);
            expect(res.body.agentId).toBe("agent_123");
            expect(res.body.status).toBe("idle");
        });

        it("returns 404 for a missing agent", async () => {
            (prisma.agent.findUnique as any).mockResolvedValue(null);

            const res = await request(app)
                .get("/agents/missing_agent")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Agent not found");
        });

        it("returns 403 when a different user tries to fetch the agent", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "another_user", // Different owner
                name: "Their Agent",
                taskType: "SWAP",
                status: "idle",
                walletAddress: null,
            };

            (prisma.agent.findUnique as any).mockResolvedValue(mockAgent);

            const res = await request(app)
                .get("/agents/agent_123")
                .set("Authorization", "Bearer mock-token"); // authenticated as "0x123"

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/Forbidden/);
        });
    });

    // ─── DELETE /agents/:id ───────────────────────────────────────────────────

    describe("DELETE /agents/:id", () => {
        it("deletes an agent the requester owns", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "0x123",
                name: "My Agent",
                taskType: "MONITOR",
                status: "idle",
            };

            (prisma.agent.findUnique as any).mockResolvedValue(mockAgent);
            (prisma.agent.delete as any).mockResolvedValue(mockAgent);
            (agentQueue.getJobs as any).mockResolvedValue([]);

            const res = await request(app)
                .delete("/agents/agent_123")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(prisma.agent.delete).toHaveBeenCalledWith({ where: { id: "agent_123" } });
        });

        it("returns 404 when agent does not exist", async () => {
            (prisma.agent.findUnique as any).mockResolvedValue(null);

            const res = await request(app)
                .delete("/agents/ghost_agent")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(404);
            expect(prisma.agent.delete).not.toHaveBeenCalled();
        });

        it("returns 403 when a different user tries to delete the agent", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "another_user", // Different owner — should be rejected
                name: "Their Agent",
                taskType: "SWAP",
                status: "idle",
            };

            (prisma.agent.findUnique as any).mockResolvedValue(mockAgent);

            const res = await request(app)
                .delete("/agents/agent_123")
                .set("Authorization", "Bearer mock-token"); // authenticated as "0x123"

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/Forbidden/);
            expect(prisma.agent.delete).not.toHaveBeenCalled();
        });

        it("returns 401 if missing auth token", async () => {
            const res = await request(app).delete("/agents/agent_123");
            expect(res.status).toBe(401);
        });
    });

    // ─── POST /agents/:id/run ─────────────────────────────────────────────────

    describe("POST /agents/:id/run", () => {
        it("enqueues a run job for an idle agent", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "0x123",
                name: "My Agent",
                taskType: "MONITOR",
                status: "idle",
            };

            (prisma.agent.findUnique as any).mockResolvedValue(mockAgent);
            (agentQueue.add as any).mockResolvedValue({ id: "job_456" });

            const res = await request(app)
                .post("/agents/agent_123/run")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(202);
            expect(res.body.message).toBe("Job queued successfully");
            expect(agentQueue.add).toHaveBeenCalledWith(
                "run-agent",
                { agentId: "agent_123", ownerId: "0x123", taskType: "MONITOR" },
                expect.any(Object)
            );
        });

        it("returns 409 when the agent is already active", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "0x123",
                name: "My Agent",
                taskType: "MONITOR",
                status: "active", // <-- already running
            };

            (prisma.agent.findUnique as any).mockResolvedValue(mockAgent);

            const res = await request(app)
                .post("/agents/agent_123/run")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(409);
            expect(res.body.error).toBe("Agent is already running");
            expect(agentQueue.add).not.toHaveBeenCalled();
        });

        it("returns 403 when a different user tries to run the agent", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "another_user",
                name: "Their Agent",
                taskType: "SWAP",
                status: "idle",
            };

            (prisma.agent.findUnique as any).mockResolvedValue(mockAgent);

            const res = await request(app)
                .post("/agents/agent_123/run")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(403);
            expect(agentQueue.add).not.toHaveBeenCalled();
        });

        it("returns 404 when agent does not exist", async () => {
            (prisma.agent.findUnique as any).mockResolvedValue(null);

            const res = await request(app)
                .post("/agents/ghost/run")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(404);
        });
    });
});
