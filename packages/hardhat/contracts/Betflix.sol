// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./Common.sol";

/**
 * @title Betflix
 * @notice A real-time micro-betting protocol where users bet on short-term price movements
 * @dev Integrates with Pyth Network for price feeds and price updates
 * @custom:security-contact saurabhlodha221b@gmail.com
 */
contract Betflix is ReentrancyGuard {
    using Address for address payable;

    /// @notice The Pyth Network oracle contract interface
    IPyth public pyth;

    /// @notice A struct to store bet information
    struct Bet {
        /// @dev Address of the bet creator who takes the YES position
        address player1;
        /// @dev Address of the bet joiner who takes the NO position
        address player2;
        /// @dev Amount each player bets in wei
        uint256 amount;
        /// @dev Target price to hit (stored as Pyth int64)
        int64 targetPrice;
        /// @dev Price exponent from Pyth (e.g., -8 means 8 decimals)
        int32 priceExponent;
        /// @dev Timestamp when the bet expires
        uint256 deadline;
        /// @dev Timestamp when joining is no longer allowed
        uint256 joinDeadline;
        /// @dev Price at bet creation time (stored as Pyth int64)
        int64 startPrice;
        /// @dev Pyth update fee paid by creator (refunded to resolver)
        uint256 pythUpdateFee;
        /// @dev Whether the bet has been resolved
        bool resolved;
        /// @dev Whether the bet has been cancelled
        bool cancelled;
        /// @dev Address of the winner (set after resolution)
        address winner;
        /// @dev Pyth price feed ID for this bet
        bytes32 priceFeedId;
    }

    /// @notice A mapping to store bet information
    mapping(bytes32 => Bet) public bets;

    /// @notice The minimum bet amount
    uint256 public constant MIN_BET = 0.01 ether;

    /// @notice The minimum duration of a bet
    uint256 public constant MIN_DURATION = 60; // 1 minute

    /// @notice The maximum duration of a bet
    uint256 public constant MAX_DURATION = 3600; // 1 hour

    /// @notice The maximum acceptable age for price data (in seconds)
    uint256 public constant MAX_PRICE_AGE = 60; // 1 minute

    /// @notice The minimum duration for accepting joins
    uint256 public constant MIN_JOIN_DURATION = 60; // 1 minute

    /// @notice The maximum duration for accepting joins
    uint256 public constant MAX_JOIN_DURATION = 600; // 10 minutes

    /// @notice Emitted when a new bet is created
    event BetCreated(
        bytes32 betId,
        address creator,
        int64 targetPrice,
        uint256 amount,
        uint256 deadline,
        uint256 joinDeadline
    );

    /// @notice Emitted when a player joins an existing bet
    event BetJoined(bytes32 betId, address joiner);

    /// @notice Emitted when a bet is resolved
    event BetResolved(bytes32 betId, address winner, address loser, int64 finalPrice, uint256 payout);

    /// @notice Emitted when an unmatched bet is cancelled
    event BetCancelled(bytes32 betId, address creator, uint256 refundAmount);

    /// @notice Modifier to validate the address is not zero
    /// @param _address Address to validate
    modifier isValidAddress(address _address) {
        if (_address == address(0)) revert ZeroAddress();
        _;
    }

    /// @notice Initializes the contract with the Pyth oracle address
    /// @param _pythAddress The address of the Pyth Network oracle contract
    constructor(address _pythAddress) isValidAddress(_pythAddress) {
        pyth = IPyth(_pythAddress);
    }

    /// @notice Creates a new bet with Pyth price update
    /// @dev The creator takes the YES position (betting price will reach target)
    /// @param _pythUpdateData Fresh price data from Pyth Hermes API
    /// @param _priceFeedId The Pyth price feed ID to use for this bet
    /// @param _targetPrice The target price to bet on (in Pyth's native format with exponent)
    /// @param _duration How long until bet expires (in seconds)
    /// @param _joinDuration How long to accept joins (in seconds)
    /// @return betId The unique identifier for this bet
    function createBet(
        bytes[] calldata _pythUpdateData,
        bytes32 _priceFeedId,
        int64 _targetPrice,
        uint256 _duration,
        uint256 _joinDuration
    ) external payable nonReentrant returns (bytes32 betId) {
        // Calculate Pyth update fee
        uint256 pythFee = pyth.getUpdateFee(_pythUpdateData);
        uint256 betAmount = msg.value - pythFee;

        if (betAmount < MIN_BET) revert BetAmountTooLow();
        if (_duration < MIN_DURATION || _duration > MAX_DURATION) revert BetDurationInvalid();
        if (_joinDuration < MIN_JOIN_DURATION || _joinDuration > MAX_JOIN_DURATION) revert BetDurationInvalid();
        if (_joinDuration > _duration) revert BetDurationInvalid(); // Join duration can't exceed bet duration
        if (msg.value < betAmount + pythFee) revert InsufficientPythFee();

        // Update Pyth price feeds on-chain
        pyth.updatePriceFeeds{ value: pythFee }(_pythUpdateData);

        // Get current price after update with freshness check
        PythStructs.Price memory currentPrice = pyth.getPriceNoOlderThan(_priceFeedId, MAX_PRICE_AGE);

        // Validate price is positive (crypto prices should be positive)
        if (currentPrice.price <= 0) revert PriceStale();

        betId = keccak256(abi.encodePacked(msg.sender, _priceFeedId, _targetPrice, block.timestamp, block.prevrandao));

        if (bets[betId].player1 != address(0)) revert BetAlreadyExists();

        bets[betId] = Bet({
            player1: msg.sender,
            player2: address(0),
            amount: betAmount,
            targetPrice: _targetPrice,
            priceExponent: currentPrice.expo,
            deadline: block.timestamp + _duration,
            joinDeadline: block.timestamp + _joinDuration,
            startPrice: currentPrice.price,
            pythUpdateFee: pythFee,
            resolved: false,
            cancelled: false,
            winner: address(0),
            priceFeedId: _priceFeedId
        });

        emit BetCreated(
            betId,
            msg.sender,
            _targetPrice,
            betAmount,
            block.timestamp + _duration,
            block.timestamp + _joinDuration
        );
    }

    /// @notice Joins an existing bet by taking the NO position
    /// @dev The joiner bets that the price will NOT reach the target
    /// @param _betId The unique identifier of the bet to join
    function joinBet(bytes32 _betId) external payable nonReentrant {
        Bet storage bet = bets[_betId];

        if (bet.player1 == address(0)) revert BetDoesNotExist();
        if (bet.cancelled) revert BetAlreadyResolved();
        if (bet.resolved) revert BetAlreadyResolved();
        if (bet.player2 != address(0)) revert BetAlreadyJoined();
        if (block.timestamp > bet.joinDeadline) revert BetExpired();
        if (block.timestamp >= bet.deadline) revert BetExpired();
        if (msg.value != bet.amount) revert BetAmountTooLow();

        bet.player2 = msg.sender;
        emit BetJoined(_betId, msg.sender);
    }

    /// @notice Resolves a bet using fresh Pyth price data
    /// @dev Can be called by anyone after the bet deadline
    /// @param _betId The unique identifier of the bet to resolve
    /// @param _pythUpdateData Fresh price data from Pyth Hermes API
    function resolveBet(bytes32 _betId, bytes[] calldata _pythUpdateData) external payable nonReentrant {
        Bet storage bet = bets[_betId];

        if (bet.player1 == address(0)) revert BetDoesNotExist();
        if (bet.cancelled) revert BetAlreadyResolved();
        if (bet.player2 == address(0)) revert BetAlreadyJoined(); // Can't resolve unmatched bet
        if (block.timestamp < bet.deadline) revert BetNotExpired();
        if (bet.resolved) revert BetAlreadyResolved();

        // Calculate and pay Pyth update fee
        uint256 pythFee = pyth.getUpdateFee(_pythUpdateData);
        if (msg.value < pythFee) revert InsufficientPythFee();

        // Update price feeds with fresh data
        pyth.updatePriceFeeds{ value: pythFee }(_pythUpdateData);

        // Get final price with freshness check
        PythStructs.Price memory finalPrice = pyth.getPriceNoOlderThan(bet.priceFeedId, MAX_PRICE_AGE);

        // Validate price is positive
        if (finalPrice.price <= 0) revert PriceStale();

        // Ensure price has same exponent as when bet was created
        if (finalPrice.expo != bet.priceExponent) revert PriceStale();

        bet.resolved = true;

        // Determine winner
        // player1 bets YES (price will hit or exceed target)
        // player2 bets NO (price won't hit target)
        bool targetHit = finalPrice.price >= bet.targetPrice;
        address winner = targetHit ? bet.player1 : bet.player2;
        address loser = targetHit ? bet.player2 : bet.player1;

        bet.winner = winner;

        // Calculate payout (both amounts minus a small protocol fee later)
        uint256 totalPot = bet.amount * 2;

        // Transfer winnings + original Pyth fee to winner
        payable(winner).sendValue(totalPot + bet.pythUpdateFee);

        // Refund resolver's Pyth fee
        payable(msg.sender).sendValue(pythFee);

        emit BetResolved(_betId, winner, loser, finalPrice.price, totalPot);
    }

    /// @notice Cancels an unmatched bet and refunds the creator
    /// @dev Can only be called by bet creator after join deadline if no one joined
    /// @param _betId The unique identifier of the bet to cancel
    function cancelBet(bytes32 _betId) external nonReentrant {
        Bet storage bet = bets[_betId];

        if (bet.player1 == address(0)) revert BetDoesNotExist();
        if (bet.player1 != msg.sender) revert OnlyCreatorCanRefund();
        if (bet.cancelled) revert BetAlreadyResolved();
        if (bet.resolved) revert BetAlreadyResolved();
        if (bet.player2 != address(0)) revert BetAlreadyJoined(); // Can't cancel if someone joined
        if (block.timestamp <= bet.joinDeadline) revert BetNotExpired(); // Must wait for join deadline

        bet.cancelled = true;

        uint256 refundAmount = bet.amount + bet.pythUpdateFee;
        payable(msg.sender).sendValue(refundAmount);

        emit BetCancelled(_betId, msg.sender, refundAmount);
    }

    /// @notice Retrieves the details of a specific bet
    /// @param _betId The unique identifier of the bet
    /// @return The bet struct containing all bet information
    function getBet(bytes32 _betId) external view returns (Bet memory) {
        return bets[_betId];
    }
}
