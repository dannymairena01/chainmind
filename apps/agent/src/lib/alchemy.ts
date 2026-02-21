import { Alchemy, Network } from "alchemy-sdk";
import dotenv from "dotenv";

dotenv.config();

/**
 * Alchemy SDK client for on-chain data fetching on Base Sepolia.
 *
 * Required env vars:
 *   ALCHEMY_API_KEY
 */

let _alchemy: Alchemy | null = null;

export function getAlchemyClient(): Alchemy {
    if (_alchemy) return _alchemy;

    const apiKey = process.env["ALCHEMY_API_KEY"] ?? "demo";

    _alchemy = new Alchemy({
        apiKey,
        network: Network.BASE_SEPOLIA,
    });

    return _alchemy;
}

/**
 * Fetch the native ETH balance of a wallet on Base Sepolia.
 * @param address - Wallet address to query
 * @returns Balance in ETH as a string
 */
export async function getWalletBalance(address: string): Promise<string> {
    const alchemy = getAlchemyClient();
    const balance = await alchemy.core.getBalance(address, "latest");
    // balance is a BigNumber from ethers — convert to ETH
    const balanceInEth = Number(balance) / 1e18;
    return balanceInEth.toFixed(6);
}

/**
 * Fetch recent transactions for a wallet on Base Sepolia.
 */
export async function getRecentTransactions(address: string) {
    const alchemy = getAlchemyClient();
    const result = await alchemy.core.getAssetTransfers({
        fromAddress: address,
        category: ["external", "internal", "erc20"],
        maxCount: 10,
        withMetadata: true,
    });
    return result.transfers;
}
