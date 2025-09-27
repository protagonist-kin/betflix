// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Thrown when updating an address with zero address
error ZeroAddress();

/// @notice Thrown when the bet amount is less than the minimum required
error BetAmountTooLow();

/// @notice Thrown when the bet duration is outside the allowed range
error BetDurationInvalid();

/// @notice Thrown when attempting to create a bet with an ID that already exists
error BetAlreadyExists();

/// @notice Thrown when attempting to interact with a bet that does not exist
error BetDoesNotExist();

/// @notice Thrown when attempting to join a bet that already has two players
error BetAlreadyJoined();

/// @notice Thrown when attempting to join a bet after its deadline
error BetExpired();

/// @notice Thrown when attempting to resolve a bet before its deadline
error BetNotExpired();

/// @notice Thrown when attempting to resolve a bet that has already been resolved
error BetAlreadyResolved();

/// @notice Thrown when an ETH transfer fails
error TransferFailed();

/// @notice Thrown when the provided Pyth price feed is not found
error PriceFeedNotFound();

/// @notice Thrown when the price data is stale or invalid
error PriceStale();

/// @notice Thrown when insufficient ETH is sent to cover the Pyth update fee
error InsufficientPythFee();

/// @notice Thrown when someone other than the creator tries to refund a bet
error OnlyCreatorCanRefund();

/// @notice Thrown when attempting to resolve a bet that has no opponent
error BetNotMatched();

/// @notice Thrown when ENS subdomain is invalid (empty or too long)
error InvalidENSSubdomain();

/// @notice Thrown when ENS subdomain is already taken
error ENSSubdomainTaken();
