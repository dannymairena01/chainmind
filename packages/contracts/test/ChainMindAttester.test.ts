import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRegistry, ChainMindAttester, MockEAS } from "../typechain-types";

describe("ChainMindAttester", function () {
    let registry: AgentRegistry;
    let attester: ChainMindAttester;
    let mockEAS: MockEAS;
    let owner: any;
    let other: any;
    let ownerAddr: string;

    const AGENT_WALLET = "0x1111111111111111111111111111111111111111";
    const SCHEMA_UID = ethers.encodeBytes32String("chainmind-v1-schema");
    const ZERO_HASH = ethers.ZeroHash;

    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();
        ownerAddr = await owner.getAddress();

        // Deploy MockEAS stub
        const MockEASFactory = await ethers.getContractFactory("MockEAS");
        mockEAS = (await MockEASFactory.deploy()) as MockEAS;

        // Deploy AgentRegistry
        const RegistryFactory = await ethers.getContractFactory("AgentRegistry");
        registry = (await RegistryFactory.deploy()) as AgentRegistry;

        // Deploy ChainMindAttester pointing at mock EAS + real registry
        const AttesterFactory = await ethers.getContractFactory("ChainMindAttester");
        attester = (await AttesterFactory.deploy(
            await mockEAS.getAddress(),
            await registry.getAddress(),
            SCHEMA_UID
        )) as ChainMindAttester;
    });

    // ── Constructor / Storage ─────────────────────────────────────────────────

    describe("Deployment", function () {
        it("stores the EAS address", async function () {
            expect(await attester.eas()).to.equal(await mockEAS.getAddress());
        });

        it("stores the registry address", async function () {
            expect(await attester.registry()).to.equal(await registry.getAddress());
        });

        it("stores the schema UID", async function () {
            expect(await attester.schemaUID()).to.equal(SCHEMA_UID);
        });

        it("sets deployer as owner", async function () {
            expect(await attester.owner()).to.equal(ownerAddr);
        });

        it("reverts if EAS address is zero", async function () {
            const Factory = await ethers.getContractFactory("ChainMindAttester");
            await expect(
                Factory.deploy(ethers.ZeroAddress, await registry.getAddress(), SCHEMA_UID)
            ).to.be.revertedWith("ChainMindAttester: zero EAS address");
        });

        it("reverts if registry address is zero", async function () {
            const Factory = await ethers.getContractFactory("ChainMindAttester");
            await expect(
                Factory.deploy(await mockEAS.getAddress(), ethers.ZeroAddress, SCHEMA_UID)
            ).to.be.revertedWith("ChainMindAttester: zero registry address");
        });
    });

    // ── attest() — unregistered agent ─────────────────────────────────────────

    describe("attest() — unregistered agent", function () {
        it("reverts when agentWallet is not in the registry", async function () {
            await expect(
                attester.attest(AGENT_WALLET, "MONITOR", "test rationale", ZERO_HASH)
            ).to.be.revertedWith("ChainMindAttester: not a registered agent");
        });
    });

    // ── attest() — registered agent ──────────────────────────────────────────

    describe("attest() — registered agent", function () {
        beforeEach(async function () {
            // Register the agent wallet so attest() passes the registry check
            await registry.registerAgent(ownerAddr, AGENT_WALLET);
        });

        it("calls EAS and emits ActionAttested", async function () {
            await expect(
                attester.attest(AGENT_WALLET, "SWAP", "Executed swap for best price", ZERO_HASH)
            )
                .to.emit(attester, "ActionAttested")
                .withArgs(
                    AGENT_WALLET,
                    await mockEAS.MOCK_UID(), // UID returned by MockEAS
                    "SWAP"
                );
        });

        it("accepts all three task types", async function () {
            for (const taskType of ["SWAP", "MONITOR", "ALERT"]) {
                await expect(
                    attester.attest(AGENT_WALLET, taskType, `rationale for ${taskType}`, ZERO_HASH)
                ).to.emit(attester, "ActionAttested");
            }
        });

        it("accepts a non-zero txHash", async function () {
            const txHash = ethers.keccak256(ethers.toUtf8Bytes("some-tx"));
            await expect(
                attester.attest(AGENT_WALLET, "MONITOR", "monitored event", txHash)
            ).to.emit(attester, "ActionAttested");
        });
    });

    // ── setSchemaUID ──────────────────────────────────────────────────────────

    describe("setSchemaUID", function () {
        it("allows owner to update schema UID", async function () {
            const newUID = ethers.encodeBytes32String("new-schema");
            await attester.setSchemaUID(newUID);
            expect(await attester.schemaUID()).to.equal(newUID);
        });

        it("reverts if non-owner tries to set schema UID", async function () {
            const newUID = ethers.encodeBytes32String("new-schema");
            await expect(
                attester.connect(other).setSchemaUID(newUID)
            ).to.be.revertedWithCustomError(attester, "OwnableUnauthorizedAccount");
        });
    });
});
