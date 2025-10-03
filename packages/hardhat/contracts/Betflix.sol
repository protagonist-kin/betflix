// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Common.sol";
import "./interfaces/INameWrapper.sol";

/**
 * @title Betflix
 * @notice A real-time micro-betting protocol where users bet on short-term price movements
 * @dev Integrates with Pyth Network for price feeds and price updates
 * @custom:security-contact saurabhlodha221b@gmail.com
 */
contract Betflix is ReentrancyGuard, Ownable {
    using Address for address payable;
    using SafeCast for uint256;
    using SafeCast for int256;

    /// @notice The Pyth Network oracle contract interface
    IPyth public pyth;

    /// @notice The ENS NameWrapper contract interface
    INameWrapper public nameWrapper;

    /// @notice The ENS domain node (e.g., betflix.eth)
    bytes32 public ensDomainNode;

    /// @notice The ENS resolver address for subdomains
    address public ensResolver;

    /// @notice The ENS domain name (e.g., "betflix.eth")
    string public ensDomainName;

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
        /// @dev ENS subdomain label for this bet (e.g., keccak256("bet-123"))
        bytes32 ensLabel;
        /// @dev Human-readable ENS subdomain (e.g., "bet-123")
        string ensSubdomain;
    }

    /// @notice A mapping to store bet information
    mapping(bytes32 => Bet) public bets;

    /// @notice Mapping to track used ENS subdomains
    mapping(bytes32 => bool) public usedSubdomains;

    /// @notice The minimum bet amount
    uint256 public constant MIN_BET = 0.0000000001 ether;

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
        uint256 joinDeadline,
        string ensSubdomain
    );

    /// @notice Emitted when a player joins an existing bet
    event BetJoined(bytes32 betId, address joiner);

    /// @notice Emitted when a bet is resolved and ENS subdomain is awarded
    event BetResolved(
        bytes32 betId,
        address winner,
        address loser,
        int64 finalPrice,
        uint256 payout,
        string ensSubdomain
    );

    /// @notice Emitted when an unmatched bet is cancelled
    event BetCancelled(bytes32 betId, address creator, uint256 refundAmount);

    /// @notice Emitted when ENS configuration is updated
    event ENSConfigUpdated(bytes32 domainNode, address resolver);

    /// @notice Modifier to validate the address is not zero
    /// @param _address Address to validate
    modifier isValidAddress(address _address) {
        if (_address == address(0)) revert ZeroAddress();
        _;
    }

    /// @notice Initializes the contract with the Pyth oracle address
    /// @param _pythAddress The address of the Pyth Network oracle contract
    constructor(address _pythAddress) isValidAddress(_pythAddress) Ownable(msg.sender) {
        pyth = IPyth(_pythAddress);
    }

    /// @notice Configures ENS integration for subdomain management
    /// @dev Only callable by contract owner
    /// @param _nameWrapper The ENS NameWrapper contract address
    /// @param _domainNode The ENS domain node (e.g., namehash of betflix.eth)
    /// @param _resolver The ENS resolver address for subdomains
    /// @param _domainName The ENS domain name (e.g., "betflix.eth")
    function configureENS(
        address _nameWrapper,
        bytes32 _domainNode,
        address _resolver,
        string calldata _domainName
    ) external onlyOwner {
        nameWrapper = INameWrapper(_nameWrapper);
        ensDomainNode = _domainNode;
        ensResolver = _resolver;
        ensDomainName = _domainName;

        emit ENSConfigUpdated(_domainNode, _resolver);
    }

    /// @notice Creates a new bet with Pyth price update
    /// @dev The creator takes the YES position (betting price will reach target)
    /// @param _pythUpdateData Fresh price data from Pyth Hermes API
    /// @param _priceFeedId The Pyth price feed ID to use for this bet
    /// @param _targetPrice The target price in whole USD (e.g., 50000 for $50,000)
    /// @param _duration How long until bet expires (in seconds)
    /// @param _joinDuration How long to accept joins (in seconds)
    /// @param _ensSubdomain The ENS subdomain for this bet (e.g., "epic-eth-bet")
    /// @return betId The unique identifier for this bet
    function createBet(
        bytes[] calldata _pythUpdateData,
        bytes32 _priceFeedId,
        uint256 _targetPrice,
        uint256 _duration,
        uint256 _joinDuration,
        string calldata _ensSubdomain
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

        // Convert user's target price to Pyth format
        int64 targetPriceInPythFormat = _convertToPythPrice(_targetPrice, currentPrice.expo);

        betId = keccak256(abi.encodePacked(msg.sender, _priceFeedId, _targetPrice, block.timestamp, block.prevrandao));

        if (bets[betId].player1 != address(0)) revert BetAlreadyExists();

        // Validate ENS subdomain
        if (bytes(_ensSubdomain).length == 0) revert InvalidENSSubdomain();
        if (bytes(_ensSubdomain).length > 63) revert InvalidENSSubdomain(); // ENS label max length

        // Check if subdomain is already taken
        bytes32 ensLabel = keccak256(bytes(_ensSubdomain));
        if (usedSubdomains[ensLabel]) revert ENSSubdomainTaken();

        // Mark subdomain as used
        usedSubdomains[ensLabel] = true;

        // Create the bet with ENS subdomain
        _createBetWithENS(
            betId,
            betAmount,
            targetPriceInPythFormat,
            currentPrice,
            _duration,
            _joinDuration,
            pythFee,
            _priceFeedId,
            _ensSubdomain,
            ensLabel
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
        if (bet.player2 == address(0)) revert BetNotMatched(); // Can't resolve unmatched bet
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

        // Calculate payout (both bet amounts)
        uint256 totalPot = bet.amount * 2;

        // Transfer winnings to winner (NOT the pythUpdateFee - it was already spent)
        payable(winner).sendValue(totalPot);

        // Refund resolver's Pyth fee
        payable(msg.sender).sendValue(pythFee);

        // Transfer ENS subdomain to winner if ENS is configured
        if (address(nameWrapper) != address(0) && ensDomainNode != bytes32(0)) {
            try
                nameWrapper.setSubnodeRecord(
                    ensDomainNode,
                    bet.ensSubdomain,
                    winner,
                    ensResolver,
                    0,
                    0,
                    0 // expiry (no expiry)
                )
            returns (bytes32) {} catch {}
        }

        emit BetResolved(_betId, winner, loser, finalPrice.price, totalPot, bet.ensSubdomain);
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

        // Release the ENS subdomain for reuse
        usedSubdomains[bet.ensLabel] = false;

        // Only refund the bet amount, NOT the pythUpdateFee (it was already spent)
        uint256 refundAmount = bet.amount;
        payable(msg.sender).sendValue(refundAmount);

        emit BetCancelled(_betId, msg.sender, refundAmount);
    }

    /// @notice Retrieves the details of a specific bet
    /// @param _betId The unique identifier of the bet
    /// @return The bet struct containing all bet information
    function getBet(bytes32 _betId) external view returns (Bet memory) {
        return bets[_betId];
    }

    /// @notice Gets a bet's target price in human-readable USD format
    /// @param _betId The unique identifier of the bet
    /// @return The target price in USD (e.g., 50000 for $50,000)
    function getBetTargetPriceUSD(bytes32 _betId) external view returns (uint256) {
        Bet memory bet = bets[_betId];
        if (bet.player1 == address(0)) return 0;

        // Convert from Pyth format back to USD
        // If price is 5000000000000 with expo -8, return 50000
        uint256 divisor = 10 ** uint32(-bet.priceExponent);

        // Use SafeCast to convert int64 -> int256 -> uint256
        return int256(bet.targetPrice).toUint256() / divisor;
    }

    /// @notice Converts a human-readable USD price to Pyth's format
    /// @dev Example: 50000 (for $50,000) with expo -8 becomes 5000000000000
    /// @param _usdPrice The price in USD (e.g., 50000 for $50,000)
    /// @param _expo The exponent from Pyth (e.g., -8)
    /// @return The price in Pyth's int64 format
    function _convertToPythPrice(uint256 _usdPrice, int32 _expo) internal pure returns (int64) {
        // Validate inputs
        if (_usdPrice == 0) revert PriceStale(); // Price cannot be zero
        if (_usdPrice > 100_000_000) revert PriceStale(); // Max $100 million (safe for all exponents)

        // Protect against extreme exponents
        if (_expo > -2 || _expo < -18) revert PriceStale(); // Reasonable range for price feeds

        // Convert based on exponent
        // If expo is -8, multiply by 10^8
        uint256 multiplier = 10 ** uint32(-_expo);

        // Check for potential overflow before multiplication
        if (_usdPrice > type(uint256).max / multiplier) revert PriceStale();

        uint256 pythPrice = _usdPrice * multiplier;

        // Use SafeCast to convert uint256 -> int256 -> int64
        return pythPrice.toInt256().toInt64();
    }

    /// @notice Helper function to create a bet and avoid stack too deep
    /// @dev Separated to manage local variable count
    function _createBetWithENS(
        bytes32 _betId,
        uint256 _betAmount,
        int64 _targetPrice,
        PythStructs.Price memory _currentPrice,
        uint256 _duration,
        uint256 _joinDuration,
        uint256 _pythFee,
        bytes32 _priceFeedId,
        string memory _ensSubdomain,
        bytes32 _ensLabel
    ) internal {
        bets[_betId] = Bet({
            player1: msg.sender,
            player2: address(0),
            amount: _betAmount,
            targetPrice: _targetPrice,
            priceExponent: _currentPrice.expo,
            deadline: block.timestamp + _duration,
            joinDeadline: block.timestamp + _joinDuration,
            startPrice: _currentPrice.price,
            pythUpdateFee: _pythFee,
            resolved: false,
            cancelled: false,
            winner: address(0),
            priceFeedId: _priceFeedId,
            ensLabel: _ensLabel,
            ensSubdomain: _ensSubdomain
        });

        emit BetCreated(
            _betId,
            msg.sender,
            _targetPrice,
            _betAmount,
            block.timestamp + _duration,
            block.timestamp + _joinDuration,
            _ensSubdomain
        );
    }

    /// @notice Checks if an ENS subdomain is available
    /// @param _subdomain The subdomain to check
    /// @return available True if the subdomain is available
    function isSubdomainAvailable(string calldata _subdomain) external view returns (bool available) {
        bytes32 label = keccak256(bytes(_subdomain));
        return !usedSubdomains[label];
    }

    /// @notice Gets the full ENS domain for a subdomain
    /// @dev Returns empty string if ENS is not configured
    /// @param _subdomain The subdomain
    /// @return The full domain (e.g., "epic-bet.betflix.eth")
    function getFullENSDomain(string calldata _subdomain) external view returns (string memory) {
        if (address(nameWrapper) == address(0) || bytes(ensDomainName).length == 0) return "";

        return string(abi.encodePacked(_subdomain, ".", ensDomainName));
    }

    /// @notice Emergency function to withdraw all ETH from contract
    /// @dev Only callable by owner. Use only in extreme emergency
    function emergencyWithdrawAll() external onlyOwner {
        uint256 balance = address(this).balance;
        payable(owner()).sendValue(balance);
    }

    /// @notice Allows owner to update Pyth oracle address if needed
    /// @dev Only for emergency updates if Pyth address changes
    /// @param _newPythAddress New Pyth oracle address
    function emergencyUpdatePyth(address _newPythAddress) external onlyOwner isValidAddress(_newPythAddress) {
        pyth = IPyth(_newPythAddress);
    }
}
