import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

/**
 * EAS attestation module.
 *
 * Writes on-chain attestations to Base Sepolia recording each autonomous
 * agent action. Uses the deployer private key to sign the transaction,
 * routing through ChainMindAttester.
 *
 * Required env vars:
 *   CHAINMIND_ATTESTER_ADDRESS, AGENT_REGISTRY_ADDRESS, BASE_SEPOLIA_RPC_URL, PRIVATE_KEY
 */

export interface AttestationParams {
    agentWallet: string;
    actionType: string;
    rationale: string;
    txHash?: string; // optional — not always available
}

export interface AttestationResult {
    uid: string;
}

/** EAS GraphQL API base — defaults to Base Sepolia testnet. Override with EAS_GRAPHQL_URL env var for mainnet. */
export const EAS_GRAPHQL_URL =
    process.env["EAS_GRAPHQL_URL"] ?? "https://base-sepolia.easscan.org/graphql";

/** Default timeout for external EAS GraphQL calls (ms) */
const EAS_FETCH_TIMEOUT_MS = 5_000;

/**
 * Register a newly provisioned agent wallet in the AgentRegistry.
 */
export async function registerAgent(owner: string, agentWallet: string): Promise<void> {
    const registryAddress = process.env["AGENT_REGISTRY_ADDRESS"];
    const rpcUrl = process.env["BASE_SEPOLIA_RPC_URL"];
    const privateKey = process.env["PRIVATE_KEY"];

    if (!registryAddress || !rpcUrl || !privateKey) {
        console.warn(`[Registry] Stub mode — missing env vars. Would register agent: ${agentWallet}`);
        return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const abi = ["function registerAgent(address owner, address agentWallet) external"];
    const registry = new ethers.Contract(registryAddress, abi, signer) as any;

    try {
        console.log(`[Registry] Registering agent ${agentWallet} for owner ${owner}...`);
        const tx = await registry.registerAgent(owner, agentWallet);
        await tx.wait();
        console.log(`[Registry] Agent ${agentWallet} registered successfully.`);
    } catch (err: any) {
        if (err.message?.includes("already registered")) {
            console.log(`[Registry] Agent ${agentWallet} is already registered.`);
        } else {
            console.error(`[Registry] Failed to register agent: ${err.message}`);
            throw err;
        }
    }
}

/**
 * Write an on-chain attestation recording an agent action via ChainMindAttester.
 * Falls back to stub mode if env vars are not configured.
 */
export async function writeAttestation(
    params: AttestationParams
): Promise<AttestationResult> {
    const { agentWallet, actionType, rationale, txHash } = params;

    const attesterAddress = process.env["CHAINMIND_ATTESTER_ADDRESS"];
    const rpcUrl = process.env["BASE_SEPOLIA_RPC_URL"];
    const privateKey = process.env["PRIVATE_KEY"];

    if (!attesterAddress || !rpcUrl || !privateKey) {
        console.warn(
            `[EAS] Stub mode — missing env vars. Would attest: action=${actionType} agent=${agentWallet}`
        );
        return { uid: `stub_uid_${Date.now()}` };
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const abi = [
        "function attest(address agentWallet, string calldata actionType, string calldata rationale, bytes32 txHash) external returns (bytes32 uid)"
    ];
    const attester = new ethers.Contract(attesterAddress, abi, signer) as any;

    // Pad txHash to a valid bytes32 (32 bytes / 64 hex chars)
    const rawHash = txHash && txHash.startsWith("0x") ? txHash : `0x${txHash ?? ""}`;
    const paddedHash = ethers.zeroPadValue(rawHash.slice(0, 66), 32) as `0x${string}`;

    const tx = await attester.attest(agentWallet, actionType, rationale, paddedHash);
    const receipt = await tx.wait();

    // Find the ActionAttested event to extract the UID
    let newAttestationUID = `unknown_uid_${Date.now()}`;
    for (const log of receipt.logs) {
        try {
            // ActionAttested signature hash: keccak256("ActionAttested(address,bytes32,string)")
            if (log.topics[0] === ethers.id("ActionAttested(address,bytes32,string)")) {
                newAttestationUID = log.topics[2]; // uid is the second indexed parameter
                break;
            }
        } catch { /* ignore */ }
    }

    console.log(`[EAS] Attestation written: uid=${newAttestationUID} action=${actionType}`);
    return { uid: newAttestationUID };
}

/**
 * Fetch all attestations for a given agent wallet from the EAS GraphQL API.
 * Uses a 5-second AbortController timeout to avoid hanging open API connections.
 */
export async function fetchAttestations(
    agentWallet: string,
    take: number = 20,
    skip: number = 0
): Promise<{
    uid: string;
    actionType: string;
    rationale: string;
    txHash: string;
    timestamp: string;
}[]> {
    const schemaUID = process.env["SCHEMA_UID"];
    if (!schemaUID || !agentWallet || agentWallet === "0x0000000000000000000000000000000000000000") {
        return [];
    }

    const query = `
        query GetAttestations($recipient: String!, $schemaId: String!, $take: Int!, $skip: Int!) {
            attestations(
                where: {
                    recipient: { equals: $recipient }
                    schemaId: { equals: $schemaId }
                }
                orderBy: { time: desc }
                take: $take
                skip: $skip
            ) {
                id
                time
                decodedDataJson
            }
        }
    `;

    // H-2: Abort the fetch if the EAS API doesn't respond within the timeout window.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EAS_FETCH_TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(EAS_GRAPHQL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                variables: { recipient: agentWallet.toLowerCase(), schemaId: schemaUID, take, skip },
            }),
            signal: controller.signal,
        });
    } catch (err: any) {
        if (err.name === "AbortError") {
            console.warn(`[EAS] GraphQL fetch timed out after ${EAS_FETCH_TIMEOUT_MS}ms`);
        } else {
            console.warn("[EAS] GraphQL fetch error:", err.message);
        }
        return [];
    } finally {
        clearTimeout(timeoutId);
    }

    if (!res.ok) {
        console.warn("[EAS] GraphQL fetch failed:", res.statusText);
        return [];
    }

    const json = await res.json() as {
        data?: { attestations: { id: string; time: number; decodedDataJson: string }[] }
    };

    const attestations = json.data?.attestations ?? [];

    return attestations.map((a) => {
        let decoded: Record<string, { value: { value: string } }> = {};
        try { decoded = JSON.parse(a.decodedDataJson); } catch { /* ignored */ }
        return {
            uid: a.id,
            actionType: (decoded["actionType"]?.value?.value as string) ?? "UNKNOWN",
            rationale: (decoded["rationale"]?.value?.value as string) ?? "",
            txHash: (decoded["txHash"]?.value?.value as string) ?? "",
            timestamp: new Date(Number(a.time) * 1000).toISOString(),
        };
    });
}
