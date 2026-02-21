"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

interface AgentActivity {
    timestamp: string;
    action: string;
    attestationUID: string | null;
    txHash: string | null;
}

interface AgentDetail {
    agentId: string;
    status: "active" | "idle" | "error";
    walletAddress: string;
    balance: string;
    recentActivity: AgentActivity[];
}

const AGENT_API = process.env["NEXT_PUBLIC_AGENT_API_URL"] ?? "http://localhost:3001";

async function fetchAgent(id: string): Promise<AgentDetail> {
    const res = await fetch(`${AGENT_API}/agents/${id}`);
    if (!res.ok) throw new Error("Agent not found");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return res.json() as Promise<AgentDetail>;
}

export default function AgentDetailPage() {
    const params = useParams<{ id: string }>();
    const agentId = params.id;

    const { data: agent, isLoading, error } = useQuery({
        queryKey: ["agent", agentId],
        queryFn: () => fetchAgent(agentId),
        refetchInterval: 10_000, // poll every 10 s
    });

    if (isLoading) {
        return (
            <main className="flex min-h-screen items-center justify-center">
                <p className="text-gray-400 animate-pulse">Loading agent…</p>
            </main>
        );
    }

    if (error || !agent) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-4">
                <p className="text-red-400">Could not load agent.</p>
                <Link href="/dashboard" className="text-indigo-400 hover:underline text-sm">
                    ← Back to Dashboard
                </Link>
            </main>
        );
    }

    const statusColor =
        agent.status === "active"
            ? "text-green-400"
            : agent.status === "error"
                ? "text-red-400"
                : "text-gray-400";

    return (
        <main className="mx-auto max-w-4xl px-6 py-12">
            {/* Back */}
            <Link
                href="/dashboard"
                className="text-sm text-gray-500 hover:text-gray-300 transition mb-6 inline-block"
            >
                ← Dashboard
            </Link>

            {/* Agent Header */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6 backdrop-blur">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            Agent{" "}
                            <span className="font-mono text-indigo-400">
                                {agent.agentId}
                            </span>
                        </h1>
                        <p className="text-sm font-mono text-gray-500 mt-1">
                            Wallet:{" "}
                            <span className="text-gray-300">{agent.walletAddress || "—"}</span>
                        </p>
                    </div>
                    <span className={`text-sm font-medium capitalize ${statusColor}`}>
                        ● {agent.status}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-gray-500 mb-1">Wallet Balance</p>
                        <p className="text-xl font-semibold text-white">
                            {agent.balance ?? "—"} ETH
                        </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-gray-500 mb-1">Attestations</p>
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
                        No activity yet. The agent is running its first job.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {agent.recentActivity.map((activity, i) => (
                            <div
                                key={i}
                                className="flex items-start justify-between rounded-xl border border-white/5 bg-white/3 px-4 py-3"
                            >
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        {activity.action}
                                    </p>
                                    {activity.attestationUID && (
                                        <p className="text-xs text-indigo-400 font-mono mt-0.5">
                                            EAS: {activity.attestationUID.slice(0, 20)}…
                                        </p>
                                    )}
                                </div>
                                <p className="text-xs text-gray-600 whitespace-nowrap ml-4">
                                    {new Date(activity.timestamp).toLocaleTimeString()}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
