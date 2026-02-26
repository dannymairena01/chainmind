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
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import {
    AgentKit,
    CdpEvmWalletProvider,
    wethActionProvider,
    walletActionProvider,
    erc20ActionProvider,
    cdpApiActionProvider,
} from "@coinbase/agentkit";
import { writeAttestation, registerAgent } from "../lib/eas";
import { encryptJSON, decryptJSON } from "../lib/encryption";

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
    getJobs(types: string[]): Promise<any[]>;
};

let sharedQueueConn: any = null;
let agentQueueInstance: any = null;

export const agentQueue: QueueLike = {
    async add(name, data, opts) {
        const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
        try {
            const { Queue } = await import("bullmq");
            const IORedis = (await import("ioredis")).default;

            if (!sharedQueueConn) {
                sharedQueueConn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
                agentQueueInstance = new Queue("agent-tasks", {
                    connection: sharedQueueConn as any,
                    defaultJobOptions: {
                        removeOnComplete: 100,
                        removeOnFail: 50,
                        attempts: 3,
                        backoff: { type: "exponential", delay: 5000 }
                    },
                });
            }

            // Allow caller opts to override defaults if needed
            const jobOpts = { ...opts };
            const job = await agentQueueInstance.add(name, data, jobOpts);
            return job;
        } catch (err) {
            console.warn("[Queue] Redis unavailable — job enqueue skipped (stub mode):", (err as Error).message);
            return null;
        }
    },
    async getJobs(types: string[]) {
        const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
        try {
            const { Queue } = await import("bullmq");
            const IORedis = (await import("ioredis")).default;

            if (!sharedQueueConn) {
                sharedQueueConn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
                agentQueueInstance = new Queue("agent-tasks", { connection: sharedQueueConn as any });
            }

            return agentQueueInstance.getJobs(types);
        } catch (err) {
            console.warn("[Queue] Redis unavailable — getJobs skipped:", (err as Error).message);
            return [];
        }
    }
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
            // Attempt to decrypt the wallet data from the DB
            let rawJson = walletDataStr;
            // A simple heuristic: if it contains our "iv:authTag:cipher" colon format, decrypt
            if (walletDataStr.split(":").length === 3) {
                rawJson = decryptJSON(walletDataStr);
                // Also overwrite walletDataStr so the CdpEvmWalletProvider gets the decrypted object
                walletDataStr = rawJson;
            }

            const parsed = JSON.parse(rawJson) as { address?: string };
            savedAddress = parsed.address;
        } catch (err: any) {
            console.error(`[Worker] Failed to parse/decrypt stored wallet material for agent ${agentId}:`, err.message);
        }
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
    if (!agent.cdpWalletData) {
        const walletAddress = walletProvider.getAddress();
        const exported = await walletProvider.exportWallet();

        // Encrypt the sensitive key material before saving to DB
        const encryptedWalletData = encryptJSON(JSON.stringify(exported));

        await prisma.agent.update({
            where: { id: agentId },
            data: {
                cdpWalletData: encryptedWalletData,
                walletAddress,
            },
        });

        // TODO: agent.ownerId is a Privy internal ID (e.g. "clxxxxxxxx"), NOT an 0x Ethereum address.
        // AgentRegistry.sol's registerAgent(address owner, address agentWallet) requires a real EVM address.
        // Once the creation route stores the owner's linked EVM address on the Agent record, use that here.
        // For now, this call is intentionally skipped to avoid an ethers.js encoding error.
        console.warn(`[Registry] Skipping registerAgent: owner EVM address not yet stored for agent ${agentId}. Resolve by storing linked EVM address at creation time.`);
    }

    const actionProviders: any[] = [
        walletActionProvider(),
        cdpApiActionProvider(),
    ];

    // Only allow token/swap tools if the task type requires it. 
    // This prevents a "MONITOR" agent from accidentally/maliciously spending funds
    if (agent.taskType !== "MONITOR") {
        actionProviders.push(
            wethActionProvider(),
            erc20ActionProvider()
        );
    }

    const agentkit = await AgentKit.from({
        walletProvider,
        actionProviders,
    });

    const tools = await getLangChainTools(agentkit);

    // Hardcoded system modifier — user instructions are kept strictly separated 
    // to prevent prompt injection overriding core constraints.
    const messageModifier = `You are a helpful Web3 autonomous agent named '${agent.name}' operating on Base Sepolia. Your core objective is: ${agent.taskType}. 
IMPORTANT: Your task instructions will be provided in the next user message. You must execute them safely and intelligently within your tool constraints.`;

    // NOTE: We intentionally do NOT pass a checkpointSaver here.
    // Using a shared MemorySaver with the same thread_id across job runs causes
    // the OpenAI "Missing tool_call_id" 400 error because stale tool messages
    // from previous runs get replayed in the next request.
    const reactAgent = createReactAgent({
        llm,
        tools,
        messageModifier,
    });

    return { reactAgent, agent };
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
                    data: { status: "active", lastAction: "Initializing agent and checking wallet..." }
                });

                try {
                    const { reactAgent, agent: agentRecord } = await initializeAgent(agentId);

                    // Use a unique thread_id per job to avoid replaying stale tool messages.
                    // Set recursionLimit: 5 as a circuit breaker so hallucinating agents 
                    // don't burn unbounded OpenAI tokens or gas.
                    const runConfig = {
                        configurable: { thread_id: `${agentId}-${job.id}` },
                        recursionLimit: 5
                    };

                    const agentMessages: string[] = [];

                    // The raw user prompt is passed as a HumanMessage *after* the system prompt, mitigating prompt injection
                    const userMessage = `Please execute your assigned task objective: ${taskType}. Use your tools dynamically to achieve this.\n\nUser Instructions: ${agentRecord.description || "Do your best to accomplish the goal using your available tools."}`;

                    // Check idempotency: Did this job ID already finish the stream in a previous failed attempt?
                    if (agentRecord.pendingTxHash === String(job.id) && agentRecord.pendingRationale) {
                        console.log(`[Worker] Job ${job.id} already completed LLM stream. Skipping to attestation.`);
                        agentMessages.push(agentRecord.pendingRationale);
                    } else {
                        const stream = await reactAgent.stream(
                            { messages: [{ role: "user", content: userMessage }] },
                            runConfig
                        );

                        for await (const chunk of stream) {
                            if (chunk.agent?.messages && chunk.agent.messages.length > 0) {
                                const msg = String(chunk.agent.messages[0].content);
                                agentMessages.push(msg);
                                console.log(`[Agent ${agentId}]`, msg);
                            } else if (chunk.tools) {
                                console.log(`[Agent ${agentId}] Autonomous Tool Execution triggered`);
                                await prisma.agent.update({
                                    where: { id: agentId },
                                    data: { lastAction: "Executing autonomous tool..." }
                                });
                            }
                        }

                        // Determine the single final coherent message for the rationale (Fixes #8)
                        const finalMessage = agentMessages.length > 0
                            ? (agentMessages[agentMessages.length - 1] || "").slice(0, 500)
                            : `Executed task: ${taskType}`;

                        agentMessages.length = 0;
                        agentMessages.push(finalMessage);

                        // Checkpoint state to DB so retries skip the LLM/transactions
                        await prisma.agent.update({
                            where: { id: agentId },
                            data: {
                                pendingTxHash: String(job.id),
                                pendingRationale: finalMessage
                            }
                        });
                    }

                    // Write an EAS attestation recording this agent action
                    if (agentRecord.walletAddress) {
                        const rationale = agentMessages[0] || `Executed task: ${taskType}`;
                        await writeAttestation({
                            agentWallet: agentRecord.walletAddress,
                            actionType: taskType,
                            rationale,
                        }).catch((err: Error) =>
                            console.warn(`[EAS] Attestation failed (non-fatal): ${err.message}`)
                        );
                    }

                    // Mark agent as idle (ready for next job), clear checkpoint
                    await prisma.agent.update({
                        where: { id: agentId },
                        data: {
                            status: "idle",
                            lastAction: `Finished job ${job.id}`,
                            pendingTxHash: null,
                            pendingRationale: null
                        }
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
            { connection: conn as any, concurrency: 5 }
        );

        worker.on("completed", (job) => console.log(`[Worker] ${job.id} finished`));
        worker.on("failed", (job, err) => {
            console.error(`[Worker] ${job?.id} failed:`, err.message);

            // Check if this was the last attempt (DLQ logic)
            if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
                console.error(`[Worker/DLQ] Job ${job.id} (Agent ${job.data?.agentId}) exhausted all retries and is now dead.`);
                // In a production system, you'd write this to a 'DeadLetter' table here 
                // or send a Slack/PagerDuty alert.
            }
        });

        _workerStarted = true;
        console.log("[Worker] BullMQ worker started");
    } catch (err) {
        console.warn(
            "[Worker] Redis unavailable — worker not started (stub mode):",
            (err as Error).message
        );
    }
}
