// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice ENS Registry interface for subdomain management
interface IENSRegistry {
    function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external returns (bytes32);

    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    ) external returns (bytes32);

    function owner(bytes32 node) external view returns (address);

    function resolver(bytes32 node) external view returns (address);
}
