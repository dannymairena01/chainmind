/**
 * BullMQ queue and worker stubs.
 *
 * In this scaffold, the Queue and Worker are only initialized if the
 * REDIS_URL environment variable resolves to a reachable Redis instance.
 * When Redis is absent (e.g. local dev without Docker), the HTTP server
 * still starts cleanly; job enqueueing is a no-op with a warning.
 */

import dotenv from "dotenv";

dotenv.config();

// ─── Job Payload Types ────────────────────────────────────────────────────────

export interface AgentJobData {
    agentId: string;
    ownerId: string;
    taskType: string;
}

// ─── Lazy Queue Accessor ─────────────────────────────────────────────────────

// We avoid importing bullmq/ioredis at the top level so the HTTP server
// can start without Redis being present.
type QueueLike = {
    add(name: string, data: AgentJobData, opts?: object): Promise<unknown>;
};

export const agentQueue: QueueLike = {
    async add(name, data, opts) {
        const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
        try {
            const { Queue } = await import("bullmq");
            const IORedis = (await import("ioredis")).default;
            const conn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
            const q = new Queue("agent-tasks", {
                connection: conn,
                defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
            });
            const job = await q.add(name, data, opts);
            await conn.quit();
            return job;
        } catch (err) {
            console.warn("[Queue] Redis unavailable — job enqueue skipped (stub mode):", (err as Error).message);
            return null;
        }
    },
};

// ─── Worker ───────────────────────────────────────────────────────────────────

let _workerStarted = false;

/**
 * Start the BullMQ worker. Call AFTER the HTTP server is up.
 * Safe to call when Redis is unavailable — logs a warning and returns.
 */
export async function startWorker(): Promise<void> {
    if (_workerStarted) return;
    const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

    try {
        const { Worker } = await import("bullmq");
        const IORedis = (await import("ioredis")).default;

        const conn = new IORedis(REDIS_URL, {
            maxRetriesPerRequest: null,
            lazyConnect: false,
        });

        // test connection before creating worker
        await conn.ping();

        const worker = new Worker<AgentJobData>(
            "agent-tasks",
            async (job) => {
                const { agentId, taskType } = job.data;
                console.log(`[Worker] job=${job.id} agent=${agentId} task=${taskType}`);
                // TODO: LLM → AgentKit → EAS
                console.log(`[Worker] job=${job.id} done (stub)`);
            },
            { connection: conn, concurrency: 5 }
        );

        worker.on("completed", (job) => console.log(`[Worker] ${job.id} finished`));
        worker.on("failed", (job, err) =>
            console.error(`[Worker] ${job?.id} failed:`, err.message)
        );

        _workerStarted = true;
        console.log("[Worker] BullMQ worker started");
    } catch (err) {
        console.warn(
            "[Worker] Redis unavailable — worker not started (stub mode):",
            (err as Error).message
        );
    }
}
