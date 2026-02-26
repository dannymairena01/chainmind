"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

type AgentStatus = "active" | "idle" | "error";

interface Agent {
    id: string;
    name: string;
    taskType: string;
    status: AgentStatus;
    walletAddress: string;
    lastAction: string;
}

const STATUS_STYLES: Record<AgentStatus, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    idle: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
};

const AGENT_API = process.env["NEXT_PUBLIC_AGENT_API_URL"] ?? "http://localhost:3001";

async function fetchUserAgents(
    ownerId: string,
    getToken: () => Promise<string | null>
): Promise<Agent[]> {
    const token = await getToken();

    const res = await fetch(`${AGENT_API}/agents`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok) throw new Error("Failed to fetch agents");
    const data = await res.json() as { agents: Agent[] };
    return data.agents;
}

export default function DashboardPage() {
    const { user, authenticated, login, getAccessToken } = usePrivy();
    const queryClient = useQueryClient();
    // Track which agent IDs have a delete in-flight so we only disable THAT button
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

    const { data: agents = [], isLoading } = useQuery({
        queryKey: ["agents", user?.wallet?.address],
        queryFn: () => fetchUserAgents(user?.wallet?.address as string, getAccessToken),
        enabled: Boolean(user?.wallet?.address),
        refetchInterval: 10_000,
    });

    const deleteAgentMutation = useMutation({
        mutationFn: async (agentId: string) => {
            setDeletingIds((prev) => new Set(prev).add(agentId));
            const token = await getAccessToken();
            const res = await fetch(`${AGENT_API}/agents/${agentId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) {
                // Backend returns JSON: { error: "..." }
                const body = await res.json().catch(() => ({ error: "Failed to delete agent" })) as { error?: string };
                throw new Error(body.error ?? "Failed to delete agent");
            }
        },
        onSettled: (_data, _err, agentId) => {
            setDeletingIds((prev) => { const next = new Set(prev); next.delete(agentId); return next; });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["agents", user?.wallet?.address] });
        },
    });

    if (!authenticated) {
        return (
            <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
                <div className="text-center">
                    <p className="text-gray-400 mb-2">Connect your wallet to see your agents.</p>
                    <p className="text-gray-600 text-sm">Use the <strong className="text-gray-400">Connect Wallet</strong> button in the top-right.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-5xl px-6 py-12">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">My Agents</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Wallet:{" "}
                        <span className="font-mono text-indigo-400">
                            {user?.wallet?.address?.slice(0, 6)}…
                            {user?.wallet?.address?.slice(-4)}
                        </span>
                    </p>
                </div>
                <Link
                    href="/agents/new"
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition"
                >
                    + New Agent
                </Link>
            </div>

            {/* Agent cards */}
            {isLoading ? (
                <div className="text-gray-500 text-center py-12 animate-pulse">
                    Loading your agents...
                </div>
            ) : agents.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
                    <p className="text-gray-400 mb-4">You haven't deployed any agents yet.</p>
                    <Link
                        href="/agents/new"
                        className="text-indigo-400 hover:text-indigo-300 transition"
                    >
                        Create your first AI Agent →
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4">
                    {agents.map((agent) => (
                        <Link
                            key={agent.id}
                            href={`/agents/${agent.id}`}
                            className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:border-indigo-500/40 hover:bg-white/8"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition">
                                        {agent.name}
                                    </h2>
                                    <p className="text-sm text-gray-500 font-mono mt-0.5">
                                        {agent.walletAddress || "Provisioning wallet..."}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span
                                        className={`rounded-full border px-3 py-0.5 text-xs font-medium ${STATUS_STYLES[agent.status] ?? STATUS_STYLES.idle}`}
                                    >
                                        {agent.status}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (confirm("Are you sure you want to delete this agent?")) {
                                                deleteAgentMutation.mutate(agent.id);
                                            }
                                        }}
                                        disabled={deletingIds.has(agent.id)}
                                        className="text-gray-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Delete Agent"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18"></path>
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center gap-6 text-sm text-gray-400">
                                <span className="flex items-center gap-1.5">
                                    <span className="text-gray-600">Task:</span> {agent.taskType}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="text-gray-600">Last:</span> {agent.lastAction || "Running first job"}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
