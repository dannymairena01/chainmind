"use client";

import { usePrivy } from "@privy-io/react-auth";
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

// Placeholder agents — replaced by real API calls in production
const STUB_AGENTS: Agent[] = [
    {
        id: "agent_1",
        name: "Alpha Monitor",
        taskType: "MONITOR",
        status: "active",
        walletAddress: "0xAbCd...1234",
        lastAction: "Watched wallet for transfers",
    },
    {
        id: "agent_2",
        name: "Beta Swapper",
        taskType: "SWAP",
        status: "idle",
        walletAddress: "0xEfGh...5678",
        lastAction: "Waiting for trigger price",
    },
];

export default function DashboardPage() {
    const { user, authenticated, login } = usePrivy();

    if (!authenticated) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center">
                <p className="text-gray-400 mb-4">Connect your wallet to view your agents.</p>
                <button
                    onClick={login}
                    className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 transition"
                >
                    Connect Wallet
                </button>
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
            <div className="grid gap-4">
                {STUB_AGENTS.map((agent) => (
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
                                    {agent.walletAddress}
                                </p>
                            </div>
                            <span
                                className={`rounded-full border px-3 py-0.5 text-xs font-medium ${STATUS_STYLES[agent.status]}`}
                            >
                                {agent.status}
                            </span>
                        </div>
                        <div className="mt-4 flex items-center gap-6 text-sm text-gray-400">
                            <span className="flex items-center gap-1.5">
                                <span className="text-gray-600">Task:</span> {agent.taskType}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="text-gray-600">Last:</span> {agent.lastAction}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </main>
    );
}
