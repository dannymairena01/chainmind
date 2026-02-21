import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/**
 * LLM integration via Vercel AI SDK with OpenAI tool-calling.
 *
 * Agents use this module to decide which on-chain action to take
 * given a task description and current context.
 *
 * Required env vars:
 *   OPENAI_API_KEY
 */

export interface AgentDecision {
    action: string;
    rationale: string;
    parameters: Record<string, string>;
}

/**
 * Ask the LLM to decide what action the agent should take.
 * @param taskType - High-level task category (e.g. "MONITOR", "SWAP")
 * @param context  - Current agent context (balances, last action, etc.)
 */
export async function getAgentDecision(
    taskType: string,
    context: string
): Promise<AgentDecision> {
    if (!process.env["OPENAI_API_KEY"]) {
        // Stub mode — return a no-op decision
        console.log("[LLM] Stub: no OPENAI_API_KEY, returning stub decision");
        return {
            action: "NO_OP",
            rationale: "Stub mode — no API key configured",
            parameters: {},
        };
    }

    const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        tools: {
            executeSwap: tool({
                description: "Execute a token swap on Base Sepolia via a DEX",
                parameters: z.object({
                    fromToken: z.string().describe("Token address to sell"),
                    toToken: z.string().describe("Token address to buy"),
                    amount: z.string().describe("Amount to swap in wei"),
                }),
            }),
            monitorWallet: tool({
                description: "Monitor a wallet for specific on-chain events",
                parameters: z.object({
                    walletAddress: z.string().describe("Wallet to monitor"),
                    eventType: z.string().describe("Type of event to watch for"),
                }),
            }),
        },
        system: `You are an autonomous on-chain AI agent on Base Sepolia. 
Your task type is: ${taskType}.
Given context, decide on the next best action. 
Always explain your rationale clearly.`,
        prompt: `Current agent context:\n${context}\n\nWhat action should be taken?`,
    });

    // Parse tool call or text response
    return {
        action: taskType,
        rationale: text,
        parameters: {},
    };
}
