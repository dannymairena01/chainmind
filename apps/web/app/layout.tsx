import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "ChainMind — AI Agent Network on Base",
    description:
        "Deploy autonomous AI agents with real on-chain wallets on Base Sepolia. Every action attested via EAS.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className={`${inter.className} min-h-screen bg-gray-950 text-white`}>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
