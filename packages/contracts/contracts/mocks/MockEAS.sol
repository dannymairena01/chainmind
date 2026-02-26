// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev Minimal EAS mock for testing ChainMindAttester.
 * Returns a deterministic non-zero UID for every attest() call.
 */
contract MockEAS {
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

    bytes32 public constant MOCK_UID =
        0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef;

    function attest(
        AttestationRequest calldata /* request */
    ) external payable returns (bytes32) {
        return MOCK_UID;
    }
}
