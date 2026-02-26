// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal interface for the EAS core contract
interface IEAS {
    struct AttestationRequestData {
        address recipient;
        uint64 expirationTime;
        bool revocable;
        bytes32 refUID;
        bytes data;
        uint256 value;
    }

    struct AttestationRequest {
        bytes32 schema;
        AttestationRequestData data;
    }

    function attest(
        AttestationRequest calldata request
    ) external payable returns (bytes32);
}

/// @notice Minimal interface to query the AgentRegistry
interface IAgentRegistry {
    function isRegisteredAgent(address agentWallet) external view returns (bool);
}

/// @title ChainMindAttester
/// @notice Wraps the EAS core contract. Only registered agent wallets (per
///         AgentRegistry) can submit attestations. Each attestation records the
///         agent wallet, action type, rationale, and the associated tx hash.
contract ChainMindAttester is Ownable {
    // ─── Storage ───────────────────────────────────────────────────────────────

    IEAS public immutable eas;
    IAgentRegistry public immutable registry;
    bytes32 public schemaUID;

    // ─── Events ────────────────────────────────────────────────────────────────

    event ActionAttested(
        address indexed agentWallet,
        bytes32 indexed uid,
        string actionType
    );

    // ─── Constructor ───────────────────────────────────────────────────────────

    /// @param easAddress  Address of the EAS core contract on Base Sepolia
    /// @param registryAddress Address of the deployed AgentRegistry
    /// @param _schemaUID  The EAS schema UID registered for ChainMind attestations
    constructor(
        address easAddress,
        address registryAddress,
        bytes32 _schemaUID
    ) Ownable(msg.sender) {
        require(easAddress != address(0), "ChainMindAttester: zero EAS address");
        require(
            registryAddress != address(0),
            "ChainMindAttester: zero registry address"
        );
        eas = IEAS(easAddress);
        registry = IAgentRegistry(registryAddress);
        schemaUID = _schemaUID;
    }

    // ─── External Functions ────────────────────────────────────────────────────

    /// @notice Submit an on-chain attestation for an agent action.
    ///         The `agentWallet` parameter must be a registered agent wallet
    ///         in the AgentRegistry. Note: registration is checked by address
    ///         value — the caller (msg.sender) is the backend signer, not the
    ///         agent wallet itself.
    /// @param agentWallet  The agent's on-chain wallet address (must be registered in AgentRegistry)
    /// @param actionType   Short string labelling the action (e.g. "SWAP", "MONITOR")
    /// @param rationale    Human-readable reason the agent took this action
    /// @param txHash       Hash of the triggering or resulting on-chain transaction
    /// @return uid         EAS attestation UID
    function attest(
        address agentWallet,
        string calldata actionType,
        string calldata rationale,
        bytes32 txHash
    ) external returns (bytes32 uid) {
        require(
            registry.isRegisteredAgent(agentWallet),
            "ChainMindAttester: not a registered agent"
        );

        bytes memory encodedData = abi.encode(
            agentWallet,
            actionType,
            rationale,
            txHash
        );

        IEAS.AttestationRequest memory req = IEAS.AttestationRequest({
            schema: schemaUID,
            data: IEAS.AttestationRequestData({
                recipient: agentWallet,
                expirationTime: 0,
                revocable: true,
                refUID: bytes32(0),
                data: encodedData,
                value: 0
            })
        });

        uid = eas.attest(req);
        emit ActionAttested(agentWallet, uid, actionType);
    }

    /// @notice Update the EAS schema UID (owner only)
    /// @param newSchemaUID The new schema UID to use for future attestations
    function setSchemaUID(bytes32 newSchemaUID) external onlyOwner {
        schemaUID = newSchemaUID;
    }
}
