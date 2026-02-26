import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRegistry } from "../typechain-types";

describe("AgentRegistry", function () {
    let registry: AgentRegistry;
    let owner: ReturnType<typeof ethers.provider.getSigner> extends Promise<infer T> ? T : never;
    let user: ReturnType<typeof ethers.provider.getSigner> extends Promise<infer T> ? T : never;
    let ownerAddr: string;
    let userAddr: string;
    const AGENT_WALLET = "0x1111111111111111111111111111111111111111";
    const AGENT_WALLET_2 = "0x2222222222222222222222222222222222222222";

    beforeEach(async function () {
        [owner, user] = await ethers.getSigners() as any[];
        ownerAddr = await owner.getAddress();
        userAddr = await user.getAddress();

        const Factory = await ethers.getContractFactory("AgentRegistry");
        registry = (await Factory.deploy()) as AgentRegistry;
    });

    // ── Access Control ────────────────────────────────────────────────────────

    describe("Access control", function () {
        it("sets deployer as owner", async function () {
            expect(await registry.owner()).to.equal(ownerAddr);
        });

        it("reverts if non-owner tries to register an agent", async function () {
            await expect(
                registry.connect(user).registerAgent(userAddr, AGENT_WALLET)
            ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
        });
    });

    // ── registerAgent ─────────────────────────────────────────────────────────

    describe("registerAgent", function () {
        it("registers a new agent and emits AgentRegistered", async function () {
            await expect(registry.registerAgent(ownerAddr, AGENT_WALLET))
                .to.emit(registry, "AgentRegistered")
                .withArgs(ownerAddr, AGENT_WALLET);
        });

        it("links the agent wallet to the owner", async function () {
            await registry.registerAgent(ownerAddr, AGENT_WALLET);
            expect(await registry.ownerOfAgent(AGENT_WALLET)).to.equal(ownerAddr);
        });

        it("reverts on zero owner address", async function () {
            await expect(
                registry.registerAgent(ethers.ZeroAddress, AGENT_WALLET)
            ).to.be.revertedWith("AgentRegistry: zero owner address");
        });

        it("reverts on zero agent address", async function () {
            await expect(
                registry.registerAgent(ownerAddr, ethers.ZeroAddress)
            ).to.be.revertedWith("AgentRegistry: zero agent address");
        });

        it("reverts when same agent wallet is registered twice", async function () {
            await registry.registerAgent(ownerAddr, AGENT_WALLET);
            await expect(
                registry.registerAgent(ownerAddr, AGENT_WALLET)
            ).to.be.revertedWith("AgentRegistry: agent already registered");
        });

        it("allows the same owner to register multiple agent wallets", async function () {
            await registry.registerAgent(ownerAddr, AGENT_WALLET);
            await registry.registerAgent(ownerAddr, AGENT_WALLET_2);
            const agents = await registry.getAgentsByOwner(ownerAddr);
            expect(agents).to.have.length(2);
            expect(agents).to.include(AGENT_WALLET);
            expect(agents).to.include(AGENT_WALLET_2);
        });
    });

    // ── View functions ────────────────────────────────────────────────────────

    describe("View functions", function () {
        beforeEach(async function () {
            await registry.registerAgent(ownerAddr, AGENT_WALLET);
        });

        it("isRegisteredAgent returns true for registered wallet", async function () {
            expect(await registry.isRegisteredAgent(AGENT_WALLET)).to.be.true;
        });

        it("isRegisteredAgent returns false for unregistered wallet", async function () {
            expect(await registry.isRegisteredAgent(AGENT_WALLET_2)).to.be.false;
        });

        it("getAgentsByOwner returns correct list", async function () {
            const agents = await registry.getAgentsByOwner(ownerAddr);
            expect(agents).to.deep.equal([AGENT_WALLET]);
        });

        it("getAgentsByOwner returns empty array for unregistered owner", async function () {
            const agents = await registry.getAgentsByOwner(userAddr);
            expect(agents).to.deep.equal([]);
        });

        it("ownerOfAgent returns the correct owner", async function () {
            expect(await registry.ownerOfAgent(AGENT_WALLET)).to.equal(ownerAddr);
        });
    });
});
