"use client";

import Link from "next/link";

// In scaffold mode (no NEXT_PUBLIC_PRIVY_APP_ID), PrivyProvider is not mounted,
// so we use a simple stub hook that returns no user state.
function usePrivyStub() {
    const hasPrivy = Boolean(
        typeof process !== "undefined" &&
        process.env["NEXT_PUBLIC_PRIVY_APP_ID"] &&
        process.env["NEXT_PUBLIC_PRIVY_APP_ID"] !== "placeholder-app-id"
    );

    if (!hasPrivy) {
        return { login: () => { }, authenticated: false, user: null };
    }

    // Only use real Privy when available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { usePrivy } = require("@privy-io/react-auth") as {
        usePrivy: () => { login: () => void; authenticated: boolean; user: { wallet?: { address?: string } } | null };
    };
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return usePrivy();
}

export default function LandingPage() {
    const { login, authenticated, user } = usePrivyStub();

    return (
        <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
            {/* Hero */}
            <div className="relative flex flex-col items-center gap-6 max-w-3xl">
                {/* Badge */}
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1 text-sm font-medium text-indigo-300">
                    Powered by Base Sepolia + EAS
                </span>

                {/* Headline */}
                <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
                    Deploy{" "}
                    <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                        AI Agents
                    </span>{" "}
                    on‑chain.
                </h1>

                {/* Sub */}
                <p className="text-lg text-gray-400 max-w-xl">
                    ChainMind lets you launch autonomous AI agents with real on-chain
                    wallets. Every action is recorded, verifiable, and attested via the
                    Ethereum Attestation Service.
                </p>

                {/* CTA */}
                <div className="mt-4 flex flex-col sm:flex-row gap-4">
                    {authenticated ? (
                        <Link
                            href="/dashboard"
                            className="rounded-lg bg-indigo-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500"
                        >
                            Go to Dashboard →
                        </Link>
                    ) : (
                        <button
                            onClick={login}
                            className="rounded-lg bg-indigo-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500"
                        >
                            Connect Wallet
                        </button>
                    )}
                    <a
                        href="https://base.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-white/10 bg-white/5 px-8 py-3 text-base font-semibold text-white transition hover:bg-white/10"
                    >
                        Learn About Base
                    </a>
                </div>

                {authenticated && user && (
                    <p className="text-sm text-gray-500 mt-2">
                        Connected as{" "}
                        <span className="text-indigo-400 font-mono">
                            {user.wallet?.address?.slice(0, 6)}…
                            {user.wallet?.address?.slice(-4)}
                        </span>
                    </p>
                )}
            </div>

            {/* Feature grid */}
            <div className="mt-24 grid gap-6 sm:grid-cols-3 max-w-4xl w-full">
                {[
                    {
                        icon: "🤖",
                        title: "Autonomous Agents",
                        desc: "Agents run on BullMQ job queues and make LLM-powered decisions autonomously.",
                    },
                    {
                        icon: "🔑",
                        title: "Real On-Chain Wallets",
                        desc: "Every agent gets a dedicated MPC wallet via Coinbase AgentKit — no shared keys.",
                    },
                    {
                        icon: "📜",
                        title: "On-Chain Attestations",
                        desc: "Every action is attested via EAS on Base Sepolia. Fully verifiable, forever.",
                    },
                ].map((f) => (
                    <div
                        key={f.title}
                        className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur"
                    >
                        <div className="text-3xl mb-3">{f.icon}</div>
                        <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                        <p className="text-sm text-gray-400">{f.desc}</p>
                    </div>
                ))}
            </div>
        </main>
    );
}
