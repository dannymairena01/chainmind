"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

interface AgentActivity {
    timestamp: string;
    action: string;
    attestationUID: string | null;
    txHash: string | null;
}

interface AgentDetail {
    agentId: string;
    name: string;
    taskType: string;
    status: "active" | "idle" | "error";
    walletAddress: string;
    balance: string;
    lastAction: string;
    recentActivity: AgentActivity[];
}

const AGENT_API = process.env["NEXT_PUBLIC_AGENT_API_URL"] ?? "http://localhost:3001";

async function fetchAgent(
    id: string,
    getToken: () => Promise<string | null>
): Promise<AgentDetail> {
    const token = await getToken();
    const res = await fetch(`${AGENT_API}/agents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Agent not found");
    return res.json() as Promise<AgentDetail>;
}

const STATUS_DOT: Record<string, string> = {
    active: "bg-green-400 animate-pulse",
    idle: "bg-gray-500",
    error: "bg-red-400",
};

const STATUS_TEXT: Record<string, string> = {
    active: "text-green-400",
    idle: "text-gray-400",
    error: "text-red-400",
};

export default function AgentDetailPage() {
    const params = useParams<{ id: string }>();
    const agentId = params.id;
    const { getAccessToken } = usePrivy();
    const queryClient = useQueryClient();
    const [runError, setRunError] = useState<string | null>(null);

    const { data: agent, isLoading, error } = useQuery({
        queryKey: ["agent", agentId],
        queryFn: () => fetchAgent(agentId, getAccessToken),
        refetchInterval: 5_000,
    });

    const runMutation = useMutation({
        mutationFn: async () => {
            const token = await getAccessToken();
            const res = await fetch(`${AGENT_API}/agents/${agentId}/run`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const body = await res.json() as { error?: string };
                throw new Error(body.error ?? "Failed to start agent");
            }
        },
        onSuccess: () => {
            setRunError(null);
            queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
        },
        onError: (err: Error) => setRunError(err.message),
    });

    if (isLoading) {
        return (
            <main className="flex min-h-[70vh] items-center justify-center">
                <p className="text-gray-400 animate-pulse">Loading agent…</p>
            </main>
        );
    }

    if (error || !agent) {
        return (
            <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
                <p className="text-red-400">Could not load agent.</p>
                <Link href="/dashboard" className="text-indigo-400 hover:underline text-sm">
                    ← Back to Dashboard
                </Link>
            </main>
        );
    }

    const isRunning = agent.status === "active";
    const canRun = !isRunning && !runMutation.isPending;

    return (
        <main className="mx-auto max-w-4xl px-6 py-10">
            {/* Back */}
            <Link
                href="/dashboard"
                className="text-sm text-gray-500 hover:text-gray-300 transition mb-6 inline-block"
            >
                ← Dashboard
            </Link>

            {/* Agent Header */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6 backdrop-blur">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <span
                                className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[agent.status] ?? "bg-gray-500"}`}
                            />
                            <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
                        </div>
                        <div className="flex items-center flex-wrap gap-2 mt-1">
                            <span className="bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                {agent.taskType}
                            </span>
                            <span className={`text-xs font-medium ${STATUS_TEXT[agent.status] ?? "text-gray-400"}`}>
                                {agent.status}
                            </span>
                        </div>
                        <p className="text-xs font-mono text-gray-500 mt-2 truncate">
                            {agent.walletAddress || "Provisioning wallet…"}
                        </p>
                        {agent.lastAction && (
                            <p className="text-xs text-gray-500 mt-1">
                                Last:{" "}
                                <span className="text-gray-400">{agent.lastAction}</span>
                            </p>
                        )}
                    </div>

                    {/* Run Now Button */}
                    <button
                        id="run-agent-btn"
                        onClick={() => runMutation.mutate()}
                        disabled={!canRun}
                        title={isRunning ? "Agent is already running" : "Trigger a new job"}
                        className={`shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all active:scale-95
                            ${isRunning
                                ? "bg-green-500/10 text-green-300 border border-green-500/30 cursor-not-allowed"
                                : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500"
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                        {runMutation.isPending ? (
                            <span className="flex items-center gap-2">
                                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Starting…
                            </span>
                        ) : isRunning ? (
                            "▶ Running…"
                        ) : (
                            "▶ Run Now"
                        )}
                    </button>
                </div>

                {runError && (
                    <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        {runError}
                    </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-gray-500 mb-1 text-xs uppercase tracking-wider">Wallet Balance</p>
                        <p className="text-xl font-semibold text-white">{agent.balance ?? "—"} ETH</p>
                        {agent.balance === "0" && agent.walletAddress && (
                            <a
                                href="https://www.coinbase.com/faucets/base-ethereum-goerli-faucet"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-400 hover:text-indigo-300 transition mt-1 inline-block"
                            >
                                Get testnet ETH →
                            </a>
                        )}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-gray-500 mb-1 text-xs uppercase tracking-wider">Attestations</p>
                        <p className="text-xl font-semibold text-white">
                            {agent.recentActivity.filter((a) => a.attestationUID).length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Activity Log */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <h2 className="text-lg font-semibold text-white mb-4">Activity Log</h2>

                {agent.recentActivity.length === 0 ? (
                    <p className="text-sm text-gray-600 py-8 text-center">
                        No activity yet. Hit{" "}
                        <strong className="text-gray-400">▶ Run Now</strong> to trigger the agent.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {agent.recentActivity.map((activity, i) => (
                            <div
                                key={i}
                                className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-semibold text-white">
                                            {activity.action}
                                        </span>
                                        {(activity as { rationale?: string }).rationale && (
                                            <p className="text-xs text-gray-500 truncate mt-0.5">
                                                {(activity as { rationale?: string }).rationale}
                                            </p>
                                        )}
                                        {activity.attestationUID && (
                                            <a
                                                href={`https://base-sepolia.easscan.org/attestation/view/${activity.attestationUID}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-indigo-400 font-mono mt-1 hover:text-indigo-300 transition inline-flex items-center gap-1"
                                            >
                                                EAS: {activity.attestationUID.slice(0, 18)}…
                                                <span className="text-[10px] opacity-60">↗</span>
                                            </a>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 whitespace-nowrap shrink-0">
                                        {new Date(activity.timestamp).toLocaleTimeString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
