export const GET_ACTIVE_BETS = `
  query GetActiveBets($first: Int!, $skip: Int!) {
    bets(first: $first, skip: $skip, where: { status: PENDING }, orderBy: createdAt, orderDirection: desc) {
      id
      creator {
        id
        address
      }
      joiner {
        id
        address
      }
      amount
      targetPrice
      targetPriceUSD
      startPrice
      priceExponent
      priceFeedId
      assetPair
      deadline
      joinDeadline
      ensSubdomain
      status
      createdAt
      createdTx
    }
  }
`;

export const GET_MATCHED_BETS = `
  query GetMatchedBets($first: Int!, $skip: Int!) {
    bets(first: $first, skip: $skip, where: { status: ACTIVE }, orderBy: createdAt, orderDirection: desc) {
      id
      creator {
        id
        address
      }
      joiner {
        id
        address
      }
      amount
      targetPrice
      targetPriceUSD
      startPrice
      priceExponent
      priceFeedId
      assetPair
      deadline
      joinDeadline
      ensSubdomain
      status
      createdAt
      joinedAt
      createdTx
      joinedTx
    }
  }
`;

export const GET_ALL_ACTIVE_BETS = `
  query GetAllActiveBets($first: Int!, $skip: Int!) {
    pendingBets: bets(first: $first, skip: $skip, where: { status: PENDING }, orderBy: createdAt, orderDirection: desc) {
      id
      creator {
        address
      }
      amount
      targetPriceUSD
      assetPair
      deadline
      joinDeadline
      ensSubdomain
      createdAt
    }
    matchedBets: bets(first: $first, skip: $skip, where: { status: ACTIVE }, orderBy: createdAt, orderDirection: desc) {
      id
      creator {
        address
      }
      joiner {
        address
      }
      amount
      targetPriceUSD
      priceFeedId
      assetPair
      deadline
      ensSubdomain
      createdAt
    }
  }
`;

export const GET_USER_BETS = `
  query GetUserBets($userAddress: String!, $first: Int!, $skip: Int!) {
    user(id: $userAddress) {
      betsCreated(first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
        id
        joiner {
          address
        }
        amount
        targetPrice
        assetPair
        deadline
        ensSubdomain
        status
        winner {
          address
        }
        createdAt
      }
      betsJoined(first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
        id
        creator {
          address
        }
        amount
        targetPrice
        assetPair
        deadline
        ensSubdomain
        status
        winner {
          address
        }
        createdAt
      }
    }
  }
`;

export const GET_GLOBAL_STATS = `
  query GetGlobalStats {
    globalStats(id: "global") {
      totalBets
      totalActiveBets
      totalVolume
    }
  }
`;

export const GET_BET_DETAILS = `
  query GetBetDetails($betId: String!) {
    bet(id: $betId) {
      id
      creator {
        id
        address
      }
      joiner {
        id
        address
      }
      amount
      targetPrice
      targetPriceUSD
      startPrice
      priceExponent
      priceFeedId
      assetPair
      deadline
      joinDeadline
      ensSubdomain
      ensLabel
      pythUpdateFee
      status
      resolved
      cancelled
      winner {
        id
        address
      }
      createdAt
      createdTx
      joinedAt
      joinedTx
      resolvedAt
      resolvedTx
      cancelledAt
      cancelledTx
    }
  }
`;

export const GET_RECENT_BETS = `
  query GetRecentBets($first: Int!) {
    bets(first: $first, orderBy: createdAt, orderDirection: desc) {
      id
      creator {
        id
        address
      }
      amount
      targetPriceUSD
      assetPair
      status
      ensSubdomain
      createdAt
    }
  }
`;
