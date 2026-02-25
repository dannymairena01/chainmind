"use client";

import { useParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
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
    name: string;
    taskType: string;
    status: "active" | "idle" | "error";
    walletAddress: string;
    balance: string;
    recentActivity: AgentActivity[];
}

const AGENT_API = process.env["NEXT_PUBLIC_AGENT_API_URL"] ?? "http://localhost:3001";

async function fetchAgent(
    id: string,
    getToken: () => Promise<string | null>
): Promise<AgentDetail> {
    const token = await getToken();

    const res = await fetch(`${AGENT_API}/agents/${id}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!res.ok) throw new Error("Agent not found");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return res.json() as Promise<AgentDetail>;
}

export default function AgentDetailPage() {
    const params = useParams<{ id: string }>();
    const agentId = params.id;

    // Import usePrivy to get the token, since this page accesses a locked down route
    const { getAccessToken } = usePrivy();

    const { data: agent, isLoading, error } = useQuery({
        queryKey: ["agent", agentId],
        queryFn: () => fetchAgent(agentId, getAccessToken),
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
                            {agent.name}
                        </h1>
                        <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
                            <span className="bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                {agent.taskType}
                            </span>
                        </p>
                        <p className="text-sm font-mono text-gray-500 mt-2">
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
                                className="rounded-xl border border-white/5 bg-white/3 px-4 py-3"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-semibold text-white">
                                                {activity.action}
                                            </span>
                                        </div>
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
