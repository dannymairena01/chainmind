import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

/**
 * EAS attestation stub.
 *
 * In production this module will:
 * 1. Connect to Base Sepolia via a provider
 * 2. Sign attestation transactions with the agent's private key (from AgentKit)
 * 3. Submit the attestation to the EAS contract (or ChainMindAttester)
 *
 * Required env vars:
 *   EAS_CONTRACT_ADDRESS, SCHEMA_UID, BASE_SEPOLIA_RPC_URL, PRIVATE_KEY
 */

export interface AttestationParams {
    agentWallet: string;
    actionType: string;
    rationale: string;
    txHash: string;
}

export interface AttestationResult {
    uid: string;
}

/**
 * Write an on-chain attestation recording an agent action.
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
        // Stub mode — no real credentials provided
        console.log(
            `[EAS] Stub: would attest action=${actionType} for agent=${agentWallet}`
        );
        return { uid: `stub_uid_${Date.now()}` };
    }

    // TODO: full implementation when keys are available
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const eas = new EAS(easAddress);
    eas.connect(signer);

    const schemaEncoder = new SchemaEncoder(
        "address agentWallet,string actionType,string rationale,bytes32 txHash"
    );
    const encodedData = schemaEncoder.encodeData([
        { name: "agentWallet", value: agentWallet, type: "address" },
        { name: "actionType", value: actionType, type: "string" },
        { name: "rationale", value: rationale, type: "string" },
        { name: "txHash", value: txHash, type: "bytes32" },
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
    return { uid: newAttestationUID };
}
