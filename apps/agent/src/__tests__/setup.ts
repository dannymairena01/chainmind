import { vi } from "vitest";

const mockAgent = {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
};

// Mock the Prisma Client globally so tests don't hit the real Postgres database
vi.mock("@prisma/client", () => {
    return {
        PrismaClient: class {
            agent = mockAgent;
        },
    };
});

// Mock the BullMQ Queue so tests don't require Redis
vi.mock("../queue/worker", () => {
    return {
        agentQueue: {
            add: vi.fn(),
            getJobs: vi.fn().mockResolvedValue([]),
        },
        startWorker: vi.fn(),
    };
});
