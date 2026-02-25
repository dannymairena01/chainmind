/**
 * BullMQ queue and worker stubs.
 *
 * In this scaffold, the Queue and Worker are only initialized if the
 * REDIS_URL environment variable resolves to a reachable Redis instance.
 * When Redis is absent (e.g. local dev without Docker), the HTTP server
 * still starts cleanly; job enqueueing is a no-op with a warning.
 */

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// LangChain & Coinbase AgentKit
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import {
    AgentKit,
    CdpEvmWalletProvider,
    wethActionProvider,
    walletActionProvider,
    erc20ActionProvider,
    cdpApiActionProvider,
} from "@coinbase/agentkit";
import { writeAttestation } from "../lib/eas";

dotenv.config({ path: "../../.env" });

const prisma = new PrismaClient();

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

// ─── Agent Execution Logic ───────────────────────────────────────────────────

async function initializeAgent(agentId: string) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error("Agent not found in database");

    const llm = new ChatOpenAI({
        model: "gpt-4o-mini",
        apiKey: process.env.OPENAI_API_KEY,
    });

    let walletDataStr = agent.cdpWalletData || undefined;

    // Parse saved wallet address for re-use
    let savedAddress: string | undefined;
    if (walletDataStr) {
        try {
            const parsed = JSON.parse(walletDataStr) as { address?: string };
            savedAddress = parsed.address;
        } catch { /* ignore */ }
    }

    const apiKeyId = process.env["CDP_API_KEY_ID"] ?? "";
    const apiKeySecret = process.env["CDP_API_KEY_SECRET"] ?? "";
    const walletSecret = process.env["CDP_WALLET_SECRET"] || undefined;

    console.log(`[CDP] Using apiKeyId: ${apiKeyId}`);
    console.log(`[CDP] apiKeySecret present: ${Boolean(apiKeySecret)}`);
    console.log(`[CDP] walletSecret present: ${Boolean(walletSecret)}`);

    // Instantiate or re-use the CDP EVM Wallet (new API v2)
    let walletProvider;
    try {
        walletProvider = await CdpEvmWalletProvider.configureWithWallet({
            apiKeyId,
            apiKeySecret,
            walletSecret,
            networkId: "base-sepolia",
            address: savedAddress as `0x${string}` | undefined,
        });
    } catch (cdpErr: any) {
        console.error("[CDP] Full error:", JSON.stringify(cdpErr, Object.getOwnPropertyNames(cdpErr)));
        throw new Error(`Failed to initialize wallet: ${cdpErr?.message ?? String(cdpErr)}`);
    }

    // Save the created wallet address back to the DB (first run only)
    if (!walletDataStr) {
        const walletAddress = walletProvider.getAddress();
        const exported = await walletProvider.exportWallet();
        await prisma.agent.update({
            where: { id: agentId },
            data: {
                cdpWalletData: JSON.stringify(exported),
                walletAddress,
            },
        });
    }

    const agentkit = await AgentKit.from({
        walletProvider,
        actionProviders: [
            wethActionProvider(),
            walletActionProvider(),
            erc20ActionProvider(),
            cdpApiActionProvider(),
        ],
    });

    const tools = await getLangChainTools(agentkit);
    const memory = new MemorySaver();
    const config = { configurable: { thread_id: agentId } };

    // Set the behavioral instructions of the agent based on user configuration
    const messageModifier = `You are a helpful Web3 autonomous agent named '${agent.name}' operating on Base Sepolia. Your core objective is: ${agent.taskType}. 
User Instructions: ${agent.description || "Do your best to accomplish the goal using your available tools."}`;

    const reactAgent = createReactAgent({
        llm,
        tools,
        checkpointSaver: memory,
        messageModifier,
    });

    return { reactAgent, config, agent };
}

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
                console.log(`[Worker] Started job=${job.id} for agent=${agentId} task=${taskType}`);

                await prisma.agent.update({
                    where: { id: agentId },
                    data: { status: "active" }
                });

                try {
                    const { reactAgent, config, agent: agentRecord } = await initializeAgent(agentId);

                    const agentMessages: string[] = [];

                    const stream = await reactAgent.stream(
                        { messages: [{ role: "user", content: `Please execute your assigned task objective: ${taskType}. Use your tools dynamically to achieve this.` }] },
                        config
                    );

                    for await (const chunk of stream) {
                        if (chunk.agent?.messages && chunk.agent.messages.length > 0) {
                            const msg = String(chunk.agent.messages[0].content);
                            agentMessages.push(msg);
                            console.log(`[Agent ${agentId}]`, msg);
                        } else if (chunk.tools) {
                            console.log(`[Agent ${agentId}] Autonomous Tool Execution triggered`);
                        }
                    }

                    // Write an EAS attestation recording this agent action
                    if (agentRecord.walletAddress) {
                        const rationale = agentMessages.join(" ").slice(0, 500) || `Executed task: ${taskType}`;
                        await writeAttestation({
                            agentWallet: agentRecord.walletAddress,
                            actionType: taskType,
                            rationale,
                        }).catch((err: Error) =>
                            console.warn(`[EAS] Attestation failed (non-fatal): ${err.message}`)
                        );
                    }

                    // Mark agent as idle (ready for next job)
                    await prisma.agent.update({
                        where: { id: agentId },
                        data: { status: "idle" },
                    });

                    console.log(`[Worker] Job=${job.id} mapped to agent=${agentId} completed execution`);
                } catch (err: any) {
                    console.error(`[Worker] Execution error for agent ${agentId}:`, err.message);
                    await prisma.agent.update({
                        where: { id: agentId },
                        data: { status: "error" }
                    });
                    throw err; // Trigger BullMQ fail/retry
                }
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
