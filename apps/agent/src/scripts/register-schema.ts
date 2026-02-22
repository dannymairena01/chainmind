import { SchemaRegistry } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";
import dotenv from "dotenv";

import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

// The Schema Registry contract address on Base Sepolia
const schemaRegistryContractAddress = "0x4200000000000000000000000000000000000020";
const schemaRegistry = new SchemaRegistry(schemaRegistryContractAddress);

async function main() {
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
        throw new Error("Missing BASE_SEPOLIA_RPC_URL or PRIVATE_KEY in .env");
    }

    console.log("Connecting to Base Sepolia via:", rpcUrl);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    // Check if the wallet has funds (Base Sepolia ETH) before attempting
    const balance = await provider.getBalance(signer.address);
    console.log(`Wallet address: ${signer.address}`);
    console.log(`Wallet balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === BigInt(0)) {
        throw new Error("Your wallet has 0 Base Sepolia ETH. You need some to pay for gas to register the schema. Get some from a faucet like https://faucet.quicknode.com/base/sepolia");
    }

    console.log("Connecting signer to SchemaRegistry...");
    schemaRegistry.connect(signer);

    // Initialize SchemaEncoder with the exact schema string found in the ChainMind codebase
    // "address agentWallet,string actionType,string rationale,bytes32 txHash"
    const schema = "address agentWallet, string actionType, string rationale, bytes32 txHash";

    // We can also set a resolver address and revocable boolean
    const resolverAddress = ethers.ZeroAddress; // No resolver
    const revocable = true;

    console.log("Registering schema...");
    console.log("Schema:", schema);

    try {
        const transaction = await schemaRegistry.register({
            schema,
            resolverAddress,
            revocable,
        });

        console.log("Waiting for confirmation (this may take 10-20 seconds)...");

        // EAS SDK register() returns a Transaction struct which we await to get the UID
        const newSchemaUID = await transaction.wait();
        console.log("\nSuccess! Schema registered on EAS.");
        console.log("\n==================================");
        console.log("YOUR SCHEMA UID IS:");
        console.log(newSchemaUID);
        console.log("==================================\n");
        console.log("Please copy the UID above and paste it into your .env file as SCHEMA_UID=");

    } catch (error) {
        console.error("Failed to register schema:", error);
    }
}

main().catch(console.error);
