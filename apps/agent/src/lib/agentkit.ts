import dotenv from "dotenv";

dotenv.config();

/**
 * AgentKit wallet provisioning stub.
 *
 * This module will use @coinbase/agentkit to:
 * 1. Create a new MPC wallet for each agent via the CDP API
 * 2. Return the wallet address to be registered in AgentRegistry
 *
 * CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY must be set in .env
 */

export interface AgentWallet {
    address: string;
    walletId: string;
}

/**
 * Provision a new on-chain wallet for an agent via Coinbase AgentKit.
 * @param agentId - Internal agent identifier
 * @returns AgentWallet with the provisioned address and wallet ID
 */
export async function provisionAgentWallet(
    agentId: string
): Promise<AgentWallet> {
    // TODO: initialize AgentKit with CDP credentials
    // const agentkit = await CdpAgentkit.create({
    //   apiKeyName: process.env.CDP_API_KEY_NAME,
    //   apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
    // });
    // const wallet = await agentkit.wallet.create();
    // return { address: wallet.defaultAddress, walletId: wallet.id };

    // Stub — returns a placeholder until real keys are provided
    console.log(`[AgentKit] Stub: provisioning wallet for agent ${agentId}`);
    return {
        address: `0x${"0".repeat(40)}`,
        walletId: `stub_wallet_${agentId}`,
    };
}
