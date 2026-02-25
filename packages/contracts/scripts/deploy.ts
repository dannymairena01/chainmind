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

    // ─── 3. Auto-Verify on BaseScan ────────────────────────────────────────────
    if (process.env["BASESCAN_API_KEY"]) {
        console.log("\nWaiting 30 seconds for block confirmations before verification...");
        await new Promise((resolve) => setTimeout(resolve, 30_000));

        console.log("\n--- Verifying AgentRegistry ---");
        try {
            await hre.run("verify:verify", {
                address: agentRegistryAddress,
                constructorArguments: [],
            });
            console.log("✅ AgentRegistry verified!");
        } catch (e: any) {
            console.log("⚠️ AgentRegistry verification failed:", e.message || String(e));
        }

        console.log("\n--- Verifying ChainMindAttester ---");
        try {
            await hre.run("verify:verify", {
                address: chainMindAttesterAddress,
                constructorArguments: [EAS_ADDRESS, agentRegistryAddress, SCHEMA_UID],
            });
            console.log("✅ ChainMindAttester verified!");
        } catch (e: any) {
            console.log("⚠️ ChainMindAttester verification failed:", e.message || String(e));
        }
    } else {
        console.log("\n⚠️ Skipping auto-verification: BASESCAN_API_KEY is not set in .env");
    }

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
