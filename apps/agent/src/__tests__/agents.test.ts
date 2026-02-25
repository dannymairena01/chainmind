import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../index";
import { prisma } from "../lib/prisma";
import { agentQueue } from "../queue/worker";

describe("Agent API Endpoints", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

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

            // Mock the Prisma create call
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

            // Verify Prisma was called
            expect(prisma.agent.create).toHaveBeenCalledWith({
                data: {
                    ownerId: "0x123",
                    name: "Test Agent",
                    taskType: "MONITOR",
                },
            });

            // Verify BullMQ job was queued
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
    });

    describe("GET /agents/:id", () => {
        it("fetches an existing agent", async () => {
            const mockAgent = {
                id: "agent_123",
                ownerId: "0x123",
                name: "Test Agent",
                taskType: "MONITOR",
                status: "idle",
            };

            (prisma.agent.findUnique as any).mockResolvedValue(mockAgent);

            const res = await request(app)
                .get("/agents/agent_123")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(200);
            expect(res.body.agentId).toBe("agent_123");
            expect(res.body.status).toBe("idle");
            expect(prisma.agent.findUnique).toHaveBeenCalledWith({
                where: { id: "agent_123" },
            });
        });

        it("returns 404 for a missing agent", async () => {
            (prisma.agent.findUnique as any).mockResolvedValue(null);

            const res = await request(app)
                .get("/agents/missing_agent")
                .set("Authorization", "Bearer mock-token");

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Agent not found");
        });
    });

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
});
