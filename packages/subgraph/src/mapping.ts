import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  BetCreated,
  BetJoined,
  BetResolved,
  BetCancelled,
} from "../generated/Betflix/Betflix";
import { Bet, User, GlobalStats, DailyStats } from "../generated/schema";

// Price feed IDs
const ETH_USD_FEED =
  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
const BTC_USD_FEED =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

function getOrCreateUser(address: Bytes): User {
  let id = address.toHexString();
  let user = User.load(id);

  if (user === null) {
    user = new User(id);
    user.address = address;
    user.totalBetsCreated = BigInt.fromI32(0);
    user.totalBetsJoined = BigInt.fromI32(0);
    user.totalBetsWon = BigInt.fromI32(0);
    user.totalAmountBet = BigInt.fromI32(0);
    user.totalAmountWon = BigInt.fromI32(0);
    user.ensTrophies = [];
    user.firstBetAt = BigInt.fromI32(0);
    user.lastActiveAt = BigInt.fromI32(0);
  }

  return user;
}

function getOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("global");

  if (stats === null) {
    stats = new GlobalStats("global");
    stats.totalBets = BigInt.fromI32(0);
    stats.totalActiveBets = BigInt.fromI32(0);
    stats.totalResolvedBets = BigInt.fromI32(0);
    stats.totalCancelledBets = BigInt.fromI32(0);
    stats.totalVolume = BigInt.fromI32(0);
    stats.totalUsers = BigInt.fromI32(0);
    stats.ethBetsCount = BigInt.fromI32(0);
    stats.btcBetsCount = BigInt.fromI32(0);
    stats.ethVolume = BigInt.fromI32(0);
    stats.btcVolume = BigInt.fromI32(0);
  }

  return stats;
}

function getOrCreateDailyStats(timestamp: BigInt): DailyStats {
  let dayTimestamp = timestamp
    .div(BigInt.fromI32(86400))
    .times(BigInt.fromI32(86400));
  let id = dayTimestamp.toString();
  let stats = DailyStats.load(id);

  if (stats === null) {
    stats = new DailyStats(id);
    stats.date = dayTimestamp;
    stats.betsCreated = BigInt.fromI32(0);
    stats.betsResolved = BigInt.fromI32(0);
    stats.volume = BigInt.fromI32(0);
    stats.uniqueUsers = BigInt.fromI32(0);
    stats.newUsers = BigInt.fromI32(0);
  }

  return stats;
}

export function handleBetCreated(event: BetCreated): void {
  let betId = event.params.betId.toHexString();
  let bet = new Bet(betId);

  // Get or create creator
  let creator = getOrCreateUser(event.params.creator);
  if (creator.firstBetAt.equals(BigInt.fromI32(0))) {
    creator.firstBetAt = event.block.timestamp;

    // Increment new users in daily stats
    let dailyStats = getOrCreateDailyStats(event.block.timestamp);
    dailyStats.newUsers = dailyStats.newUsers.plus(BigInt.fromI32(1));
    dailyStats.save();

    // Increment total users
    let globalStats = getOrCreateGlobalStats();
    globalStats.totalUsers = globalStats.totalUsers.plus(BigInt.fromI32(1));
    globalStats.save();
  }

  creator.totalBetsCreated = creator.totalBetsCreated.plus(BigInt.fromI32(1));
  creator.totalAmountBet = creator.totalAmountBet.plus(event.params.amount);
  creator.lastActiveAt = event.block.timestamp;
  creator.save();

  // Set bet properties from event
  bet.creator = creator.id;
  bet.amount = event.params.amount;
  bet.targetPrice = event.params.targetPrice;
  bet.targetPriceUSD = event.params.targetPrice; // For now, we'll store the raw value
  bet.deadline = event.params.deadline;
  bet.joinDeadline = event.params.joinDeadline;
  bet.ensSubdomain = event.params.ensSubdomain;

  // Set priceFeedId from event
  bet.priceFeedId = event.params.priceFeedId;

  // Determine asset pair based on priceFeedId
  if (
    event.params.priceFeedId ==
    Bytes.fromHexString(
      "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
    )
  ) {
    bet.assetPair = "BTC/USD";
  } else {
    bet.assetPair = "ETH/USD"; // Default to ETH/USD for 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
  }

  // Default values for fields not in event
  bet.startPrice = BigInt.fromI32(0);
  bet.priceExponent = 0;
  bet.ensLabel = Bytes.fromHexString("0x00");
  bet.pythUpdateFee = BigInt.fromI32(0);

  bet.status = "PENDING";
  bet.resolved = false;
  bet.cancelled = false;

  bet.createdAt = event.block.timestamp;
  bet.createdTx = event.transaction.hash.toHexString();

  bet.save();

  // Update global stats
  let globalStats = getOrCreateGlobalStats();
  globalStats.totalBets = globalStats.totalBets.plus(BigInt.fromI32(1));
  globalStats.totalActiveBets = globalStats.totalActiveBets.plus(
    BigInt.fromI32(1)
  );
  globalStats.totalVolume = globalStats.totalVolume.plus(event.params.amount);

  // For now, count all as ETH bets
  globalStats.ethBetsCount = globalStats.ethBetsCount.plus(BigInt.fromI32(1));
  globalStats.ethVolume = globalStats.ethVolume.plus(event.params.amount);

  globalStats.save();

  // Update daily stats
  let dailyStats = getOrCreateDailyStats(event.block.timestamp);
  dailyStats.betsCreated = dailyStats.betsCreated.plus(BigInt.fromI32(1));
  dailyStats.volume = dailyStats.volume.plus(event.params.amount);
  dailyStats.save();
}

export function handleBetJoined(event: BetJoined): void {
  let bet = Bet.load(event.params.betId.toHexString());
  if (bet === null) return;

  // Get or create joiner
  let joiner = getOrCreateUser(event.params.joiner);
  if (joiner.firstBetAt.equals(BigInt.fromI32(0))) {
    joiner.firstBetAt = event.block.timestamp;

    // Increment new users
    let dailyStats = getOrCreateDailyStats(event.block.timestamp);
    dailyStats.newUsers = dailyStats.newUsers.plus(BigInt.fromI32(1));
    dailyStats.save();

    let globalStats = getOrCreateGlobalStats();
    globalStats.totalUsers = globalStats.totalUsers.plus(BigInt.fromI32(1));
    globalStats.save();
  }

  joiner.totalBetsJoined = joiner.totalBetsJoined.plus(BigInt.fromI32(1));
  joiner.totalAmountBet = joiner.totalAmountBet.plus(bet.amount);
  joiner.lastActiveAt = event.block.timestamp;
  joiner.save();

  // Update bet
  bet.joiner = joiner.id;
  bet.status = "ACTIVE";
  bet.joinedAt = event.block.timestamp;
  bet.joinedTx = event.transaction.hash.toHexString();
  bet.save();

  // Update global stats
  let globalStats = getOrCreateGlobalStats();
  globalStats.totalVolume = globalStats.totalVolume.plus(bet.amount);

  // Update asset-specific volume
  if (bet.assetPair == "ETH/USD") {
    globalStats.ethVolume = globalStats.ethVolume.plus(bet.amount);
  } else if (bet.assetPair == "BTC/USD") {
    globalStats.btcVolume = globalStats.btcVolume.plus(bet.amount);
  }

  globalStats.save();

  // Update daily stats
  let dailyStats = getOrCreateDailyStats(event.block.timestamp);
  dailyStats.volume = dailyStats.volume.plus(bet.amount);
  dailyStats.save();
}

export function handleBetResolved(event: BetResolved): void {
  let bet = Bet.load(event.params.betId.toHexString());
  if (bet === null) return;

  // Update bet
  bet.status = "RESOLVED";
  bet.resolved = true;
  bet.winner = event.params.winner.toHexString();
  bet.resolvedAt = event.block.timestamp;
  bet.resolvedTx = event.transaction.hash.toHexString();
  bet.save();

  // Update winner stats
  let winner = getOrCreateUser(event.params.winner);
  winner.totalBetsWon = winner.totalBetsWon.plus(BigInt.fromI32(1));
  winner.totalAmountWon = winner.totalAmountWon.plus(event.params.payout);
  winner.lastActiveAt = event.block.timestamp;

  // Add ENS trophy to winner
  let trophies = winner.ensTrophies;
  trophies.push(event.params.ensSubdomain + ".betflix.eth");
  winner.ensTrophies = trophies;
  winner.save();

  // Update global stats
  let globalStats = getOrCreateGlobalStats();
  globalStats.totalActiveBets = globalStats.totalActiveBets.minus(
    BigInt.fromI32(1)
  );
  globalStats.totalResolvedBets = globalStats.totalResolvedBets.plus(
    BigInt.fromI32(1)
  );
  globalStats.save();

  // Update daily stats
  let dailyStats = getOrCreateDailyStats(event.block.timestamp);
  dailyStats.betsResolved = dailyStats.betsResolved.plus(BigInt.fromI32(1));
  dailyStats.save();
}

export function handleBetCancelled(event: BetCancelled): void {
  let bet = Bet.load(event.params.betId.toHexString());
  if (bet === null) return;

  // Update bet
  bet.status = "CANCELLED";
  bet.cancelled = true;
  bet.cancelledAt = event.block.timestamp;
  bet.cancelledTx = event.transaction.hash.toHexString();
  bet.save();

  // Update global stats
  let globalStats = getOrCreateGlobalStats();
  globalStats.totalActiveBets = globalStats.totalActiveBets.minus(
    BigInt.fromI32(1)
  );
  globalStats.totalCancelledBets = globalStats.totalCancelledBets.plus(
    BigInt.fromI32(1)
  );
  globalStats.save();
}
