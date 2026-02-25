import hre from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
    const ethers = hre.ethers;
    const signers = await (ethers as any).getSigners();
    const deployer: { address: string; provider: { getBalance(addr: string): Promise<bigint> } } = signers[0];
    console.log("Deploying contracts with account:", deployer.address);
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");

    // ─── 1. Deploy AgentRegistry ───────────────────────────────────────────────
    console.log("\n--- Deploying AgentRegistry ---");
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    const agentRegistry = await AgentRegistry.deploy();
    await agentRegistry.waitForDeployment();
    // ethers v6 uses .target instead of .address / .getAddress()
    const agentRegistryAddress = (agentRegistry as any).target as string;
    console.log("✅ AgentRegistry deployed to:", agentRegistryAddress);

    // ─── 2. Deploy ChainMindAttester ───────────────────────────────────────────
    const EAS_ADDRESS = process.env["EAS_CONTRACT_ADDRESS"] ?? "0x4200000000000000000000000000000000000021";
    const SCHEMA_UID = process.env["SCHEMA_UID"] ?? ethers.ZeroHash;

    console.log("\n--- Deploying ChainMindAttester ---");
    console.log("  EAS Address:", EAS_ADDRESS);
    console.log("  AgentRegistry:", agentRegistryAddress);
    console.log("  Schema UID:", SCHEMA_UID);

    const ChainMindAttester = await ethers.getContractFactory("ChainMindAttester");
    const chainMindAttester = await ChainMindAttester.deploy(
        EAS_ADDRESS,
        agentRegistryAddress,
        SCHEMA_UID
    );
    await chainMindAttester.waitForDeployment();
    const chainMindAttesterAddress = (chainMindAttester as any).target as string;
    console.log("✅ ChainMindAttester deployed to:", chainMindAttesterAddress);

    // ─── Summary ───────────────────────────────────────────────────────────────
    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║            DEPLOYMENT COMPLETE — Add these to .env            ║");
    console.log("╠════════════════════════════════════════════════════════════════╣");
    console.log(`║  AGENT_REGISTRY_ADDRESS=${agentRegistryAddress}`);
    console.log(`║  CHAINMIND_ATTESTER_ADDRESS=${chainMindAttesterAddress}`);
    console.log("╠════════════════════════════════════════════════════════════════╣");
    console.log("║  To verify on BaseScan:                                        ║");
    console.log(`║  npx hardhat verify --network baseSepolia ${agentRegistryAddress}`);
    console.log(`║  npx hardhat verify --network baseSepolia ${chainMindAttesterAddress} \\`);
    console.log(`║    ${EAS_ADDRESS} ${agentRegistryAddress} ${SCHEMA_UID}`);
    console.log("╚════════════════════════════════════════════════════════════════╝\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });
