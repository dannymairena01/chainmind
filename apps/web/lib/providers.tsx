"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./wagmi";
import { useState } from "react";

interface ProvidersProps {
    children: React.ReactNode;
}

function PrivyWrapper({ children }: { children: React.ReactNode }) {
    const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    // Only mount PrivyProvider when a real app ID is configured.
    // In stub / scaffold mode, render children directly so the page doesn't crash.
    if (!privyAppId || privyAppId === "placeholder-app-id") {
        return <>{children}</>;
    }

    // Dynamic import to avoid top-level Privy initialization without valid keys
    const { PrivyProvider } = require("@privy-io/react-auth") as {
        PrivyProvider: React.ComponentType<{
            appId: string;
            config: object;
            children: React.ReactNode;
        }>;
    };

    return (
        <PrivyProvider
            appId={privyAppId}
            config={{
                loginMethods: ["wallet", "email"],
                appearance: { theme: "dark", accentColor: "#6366f1" },
                embeddedWallets: { createOnLogin: "users-without-wallets" },
            }}
        >
            {children}
        </PrivyProvider>
    );
}

export function Providers({ children }: ProvidersProps) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <PrivyWrapper>
            <WagmiProvider config={wagmiConfig}>
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            </WagmiProvider>
        </PrivyWrapper>
    );
}
