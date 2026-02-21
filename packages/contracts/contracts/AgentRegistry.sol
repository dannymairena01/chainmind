// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentRegistry
/// @notice Tracks which AI agent wallets belong to which user wallet.
///         Only the contract owner (backend deployer) can register new agents.
contract AgentRegistry is Ownable {
    // ─── Storage ───────────────────────────────────────────────────────────────

    /// @notice Maps owner address → list of agent wallet addresses
    mapping(address => address[]) private _ownerToAgents;

    /// @notice Reverse lookup: agentWallet → owner
    mapping(address => address) private _agentToOwner;

    // ─── Events ────────────────────────────────────────────────────────────────

    /// @notice Emitted when a new agent wallet is registered
    event AgentRegistered(address indexed owner, address indexed agentWallet);

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── External Functions ────────────────────────────────────────────────────

    /// @notice Register a new agent wallet under an owner address.
    ///         Only callable by the contract owner (backend deployer key).
    /// @param owner       The user who owns this agent
    /// @param agentWallet The on-chain wallet provisioned for the agent
    function registerAgent(
        address owner,
        address agentWallet
    ) external onlyOwner {
        require(owner != address(0), "AgentRegistry: zero owner address");
        require(
            agentWallet != address(0),
            "AgentRegistry: zero agent address"
        );
        require(
            _agentToOwner[agentWallet] == address(0),
            "AgentRegistry: agent already registered"
        );

        _ownerToAgents[owner].push(agentWallet);
        _agentToOwner[agentWallet] = owner;

        emit AgentRegistered(owner, agentWallet);
    }

    /// @notice Return all agent wallets registered under a given owner.
    /// @param owner The user address to look up
    /// @return agents Array of agent wallet addresses
    function getAgentsByOwner(
        address owner
    ) external view returns (address[] memory agents) {
        return _ownerToAgents[owner];
    }

    /// @notice Check whether an address is a registered agent wallet.
    /// @param agentWallet The wallet address to verify
    function isRegisteredAgent(
        address agentWallet
    ) external view returns (bool) {
        return _agentToOwner[agentWallet] != address(0);
    }

    /// @notice Return the owner of a given agent wallet.
    /// @param agentWallet The agent wallet address
    function ownerOfAgent(
        address agentWallet
    ) external view returns (address) {
        return _agentToOwner[agentWallet];
    }
}
