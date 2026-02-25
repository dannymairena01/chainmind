import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

/**
 * EAS attestation module.
 *
 * Writes on-chain attestations to Base Sepolia recording each autonomous
 * agent action. Uses the deployer private key to sign the transaction.
 *
 * Required env vars:
 *   EAS_CONTRACT_ADDRESS, SCHEMA_UID, BASE_SEPOLIA_RPC_URL, PRIVATE_KEY
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

/** EAS GraphQL API base for Base Sepolia */
export const EAS_GRAPHQL_URL = "https://base-sepolia.easscan.org/graphql";

/**
 * Write an on-chain attestation recording an agent action.
 * Falls back to stub mode if env vars are not configured.
 */
export async function writeAttestation(
    params: AttestationParams
): Promise<AttestationResult> {
    const { agentWallet, actionType, rationale, txHash } = params;

    const easAddress = process.env["EAS_CONTRACT_ADDRESS"];
    const schemaUID = process.env["SCHEMA_UID"];
    const rpcUrl = process.env["BASE_SEPOLIA_RPC_URL"];
    const privateKey = process.env["PRIVATE_KEY"];

    if (!easAddress || !schemaUID || !rpcUrl || !privateKey) {
        console.warn(
            `[EAS] Stub mode — missing env vars. Would attest: action=${actionType} agent=${agentWallet}`
        );
        return { uid: `stub_uid_${Date.now()}` };
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const eas = new EAS(easAddress);
    eas.connect(signer);

    // Pad txHash to a valid bytes32 (32 bytes / 64 hex chars)
    const rawHash = txHash && txHash.startsWith("0x") ? txHash : `0x${txHash ?? ""}`;
    const paddedHash = ethers.zeroPadValue(rawHash.slice(0, 66), 32) as `0x${string}`;

    const schemaEncoder = new SchemaEncoder(
        "address agentWallet,string actionType,string rationale,bytes32 txHash"
    );
    const encodedData = schemaEncoder.encodeData([
        { name: "agentWallet", value: agentWallet, type: "address" },
        { name: "actionType", value: actionType, type: "string" },
        { name: "rationale", value: rationale, type: "string" },
        { name: "txHash", value: paddedHash, type: "bytes32" },
    ]);

    const tx = await eas.attest({
        schema: schemaUID,
        data: {
            recipient: agentWallet,
            expirationTime: BigInt(0),
            revocable: true,
            data: encodedData,
        },
    });

    const newAttestationUID = await tx.wait();
    console.log(`[EAS] Attestation written: uid=${newAttestationUID} action=${actionType}`);
    return { uid: newAttestationUID };
}

/**
 * Fetch all attestations for a given agent wallet from the EAS GraphQL API.
 */
export async function fetchAttestations(agentWallet: string): Promise<{
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
        query GetAttestations($recipient: String!, $schemaId: String!) {
            attestations(
                where: {
                    recipient: { equals: $recipient }
                    schemaId: { equals: $schemaId }
                }
                orderBy: { time: desc }
                take: 20
            ) {
                id
                time
                decodedDataJson
            }
        }
    `;

    const res = await fetch(EAS_GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query,
            variables: { recipient: agentWallet.toLowerCase(), schemaId: schemaUID },
        }),
    });

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
