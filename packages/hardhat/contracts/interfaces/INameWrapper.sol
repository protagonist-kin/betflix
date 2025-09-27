// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice ENS NameWrapper interface for subdomain management with wrapped names
interface INameWrapper {
    function setSubnodeRecord(
        bytes32 parentNode,
        string memory label,
        address owner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32);

    function setSubnodeOwner(
        bytes32 parentNode,
        string memory label,
        address owner,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32);

    function ownerOf(uint256 tokenId) external view returns (address);

    function setApprovalForAll(address operator, bool approved) external;
}
