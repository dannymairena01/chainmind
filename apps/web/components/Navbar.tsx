"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";

export default function Navbar() {
    const { authenticated, user, login, logout } = usePrivy();
    const pathname = usePathname();
    const [loggingOut, setLoggingOut] = useState(false);

    const walletAddress = user?.wallet?.address;
    const shortAddress = walletAddress
        ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
        : null;

    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            await logout();
        } finally {
            setLoggingOut(false);
        }
    };

    const navLinks = [
        { href: "/dashboard", label: "Dashboard" },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-gray-950/80 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
                {/* Logo */}
                <Link
                    href="/"
                    className="flex items-center gap-2 font-bold text-white text-lg tracking-tight hover:opacity-80 transition"
                >
                    ChainMind
                </Link>

                {/* Nav Links (only when logged in) */}
                {authenticated && (
                    <nav className="hidden sm:flex items-center gap-1">
                        {navLinks.map(({ href, label }) => {
                            const isActive = pathname === href || pathname.startsWith(href + "/");
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${isActive
                                        ? "bg-indigo-500/15 text-indigo-300"
                                        : "text-gray-400 hover:text-white hover:bg-white/5"
                                        }`}
                                >
                                    {label}
                                </Link>
                            );
                        })}
                    </nav>
                )}

                {/* Right side: wallet button */}
                <div className="flex items-center gap-3">
                    {authenticated ? (
                        <>
                            {/* Wallet pill */}
                            <Link
                                href="/dashboard"
                                className="hidden sm:flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-mono text-indigo-300 hover:bg-indigo-500/20 transition"
                                title={walletAddress ?? ""}
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                                {shortAddress}
                            </Link>

                            {/* Disconnect */}
                            <button
                                onClick={handleLogout}
                                disabled={loggingOut}
                                className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loggingOut ? "…" : "Disconnect"}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={login}
                            className="relative rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 transition active:scale-95"
                        >
                            Connect Wallet
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
