import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import type { Config } from "wagmi";

export const wagmiConfig: Config = createConfig({
    chains: [baseSepolia],
    connectors: [
        injected(),
        walletConnect({
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "c2b53589b3f9dc3b4f62fa22", // A valid formatted fallback just in case
        }),
    ],
    transports: {
        [baseSepolia.id]: http(
            process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
            "https://sepolia.base.org"
        ),
    },
});
