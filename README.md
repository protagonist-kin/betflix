# [Betflix](https://betflix-and-chill.vercel.app) - Real-Time Price Betting Protocol

<img width="1024" height="1024" alt="BetflixLogo" src="https://github.com/user-attachments/assets/c7b378c9-a538-45d0-9bfe-559099603cde" />

Head-to-head betting on crypto price movements with instant settlement. Users create bets with specific price targets and durations (5-60 minutes), other users take the opposite position, and winners receive ENS subdomain trophies.

## Core Components Used

### Pyth Network

- On-demand price feed updates.
- Creator pays update fee upfront, resolver gets refunded
- Validates price freshness and exponent consistency

### ENS Integration

- Winners receive unique ENS subdomains as permanent trophies
- Subdomains are pre-selected during bet creation
- Automatic transfer via NameWrapper on bet resolution

### The Graph Protocol

- Real-time indexing of bet lifecycle events
- Tracks pending/active/resolved bets and user statistics
- Reduces RPC calls and improves UI responsiveness

### Smart Contracts

- Core betting logic with configurable parameters
- Emergency functions for admin intervention
- Comprehensive error handling and fund protection

## Key Features

- **Bet Creation**: Set price target, duration, bet amount, ENS subdomain
- **Bet Matching**: Join existing bets by taking opposite position
- **Resolution**: Automatic winner determination using Pyth price feeds
- **Cancellation**: Refund for unmatched bets after join deadline

## Deployment

### Sepolia Testnet

- Contract: `0x5d4fb9e6d06faf378e68cDbd056054E21dE8EA06`
- Subgraph: Deployed on The Graph Network
- ENS Domain: betflix.eth

## Development Tools

- Scaffold-ETH 2 framework 🙏
- Hardhat for contract development
- Next.js for frontend

## Acknowledgments

- AI assistance for code documentation and generation of NAT SPEC documentation.
- AI assistance for Logo and Cover image generation.
- AI assistance for security review of Smart Contract and deployment scripts.
- AI assistance for CSS and basic designs.
- Open source libraries and protocols used

## License

MIT
