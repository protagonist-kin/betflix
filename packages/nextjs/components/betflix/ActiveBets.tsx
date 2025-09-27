"use client";

import { useMemo, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { CheckCircleIcon, ClockIcon, TrophyIcon, UserGroupIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { BetTimer } from "~~/components/betflix/BetTimer";
import { useScaffoldEventHistory, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

interface BetData {
  player1: string;
  player2: string;
  amount: bigint;
  targetPrice: bigint;
  priceExponent: number;
  deadline: bigint;
  joinDeadline: bigint;
  startPrice: bigint;
  pythUpdateFee: bigint;
  resolved: boolean;
  cancelled: boolean;
  winner: string;
  priceFeedId: string;
  ensLabel: string;
  ensSubdomain: string;
}

interface BetDisplay {
  betId: string;
  creator: string;
  targetPrice: bigint;
  amount: bigint;
  deadline: bigint;
  joinDeadline: bigint;
  ensSubdomain: string;
  hasJoiner: boolean;
  priceFeedId: string;
}

// Price feed IDs for different assets
const PRICE_FEEDS: { [key: string]: string } = {
  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace": "ETH/USD",
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43": "BTC/USD",
};

// Resolve Bet Button Component
const ResolveBetButton = ({
  betId,
  isResolving,
  onResolve,
}: {
  betId: string;
  isResolving: boolean;
  onResolve: (betId: string, priceFeedId: string) => void;
}) => {
  const [canResolve, setCanResolve] = useState(false);

  const { data: betData } = useScaffoldReadContract({
    contractName: "Betflix",
    functionName: "getBet",
    args: [betId as `0x${string}`],
  }) as { data: BetData | undefined };

  if (!betData) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm">
        <span className="text-gray-600">Time left: </span>
        <BetTimer deadline={betData.deadline} onExpired={() => setCanResolve(true)} />
      </div>
      <button
        className={`px-4 py-2 text-white text-sm rounded-lg font-medium transition-all ${
          canResolve && !isResolving
            ? "bg-green-600 hover:bg-green-700 cursor-pointer"
            : "bg-gray-500 cursor-not-allowed opacity-50"
        }`}
        onClick={() => betData && canResolve && onResolve(betId, betData.priceFeedId)}
        disabled={!canResolve || isResolving || !betData}
      >
        {isResolving ? "Resolving..." : canResolve ? "Resolve Bet" : "Not Ready"}
      </button>
    </div>
  );
};

export const ActiveBets = () => {
  const { address } = useAccount();
  const [isJoining, setIsJoining] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [expandedBets, setExpandedBets] = useState<Set<string>>(new Set());

  const { writeContractAsync } = useScaffoldWriteContract("Betflix");

  // Get BetCreated events - start from recent blocks on Sepolia
  const { data: betCreatedEvents } = useScaffoldEventHistory({
    contractName: "Betflix",
    eventName: "BetCreated",
    fromBlock: 7200000n, // Recent block on Sepolia
    watch: true,
  });

  // Get BetJoined events
  const { data: betJoinedEvents } = useScaffoldEventHistory({
    contractName: "Betflix",
    eventName: "BetJoined",
    fromBlock: 7200000n,
    watch: true,
  });

  // Get BetResolved events
  const { data: betResolvedEvents } = useScaffoldEventHistory({
    contractName: "Betflix",
    eventName: "BetResolved",
    fromBlock: 7200000n,
    watch: true,
  });

  // Get BetCancelled events
  const { data: betCancelledEvents } = useScaffoldEventHistory({
    contractName: "Betflix",
    eventName: "BetCancelled",
    fromBlock: 7200000n,
    watch: true,
  });

  const fetchPythUpdateData = async (priceFeedId: string) => {
    try {
      const response = await fetch("/api/pyth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: priceFeedId }),
      });

      if (!response.ok) throw new Error("Failed to fetch price data");

      const data = await response.json();
      return data.updateData;
    } catch (error) {
      console.error("Error fetching Pyth data:", error);
      throw error;
    }
  };

  // Process events to get active bets
  const activeBets = useMemo(() => {
    console.log("Processing active bets:", {
      betCreatedEvents: betCreatedEvents?.length || 0,
      betJoinedEvents: betJoinedEvents?.length || 0,
      betResolvedEvents: betResolvedEvents?.length || 0,
      betCancelledEvents: betCancelledEvents?.length || 0,
      currentAddress: address,
    });

    if (!betCreatedEvents) return [];

    const joinedBetIds = new Set(betJoinedEvents?.map(e => e.args.betId) || []);
    const resolvedBetIds = new Set(betResolvedEvents?.map(e => e.args.betId) || []);
    const cancelledBetIds = new Set(betCancelledEvents?.map(e => e.args.betId) || []);

    const filtered = betCreatedEvents
      .filter(event => {
        const betId = event.args.betId;
        const isResolved = resolvedBetIds.has(betId);
        const isCancelled = cancelledBetIds.has(betId);
        return !isResolved && !isCancelled;
      })
      .map(event => ({
        betId: event.args.betId || "",
        creator: event.args.creator || "",
        targetPrice: event.args.targetPrice || 0n,
        amount: event.args.amount || 0n,
        deadline: event.args.deadline || 0n,
        joinDeadline: event.args.joinDeadline || 0n,
        ensSubdomain: event.args.ensSubdomain || "",
        hasJoiner: joinedBetIds.has(event.args.betId),
        priceFeedId: "", // We'll need to fetch this from the contract
      }))
      .reverse(); // Show newest first

    console.log("Active bets found:", filtered.length);
    return filtered;
  }, [betCreatedEvents, betJoinedEvents, betResolvedEvents, betCancelledEvents, address]);

  // Fetch bet details for expanded bets
  const BetDetails = ({ betId }: { betId: string }) => {
    const { data: betData } = useScaffoldReadContract({
      contractName: "Betflix",
      functionName: "getBet",
      args: [betId as `0x${string}`],
    }) as { data: BetData | undefined };

    const { data: targetPriceUSD } = useScaffoldReadContract({
      contractName: "Betflix",
      functionName: "getBetTargetPriceUSD",
      args: [betId as `0x${string}`],
    });

    if (!betData) {
      return (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-300 rounded w-1/2"></div>
          </div>
        </div>
      );
    }

    const assetPair = PRICE_FEEDS[betData.priceFeedId] || "Unknown";

    return (
      <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="font-semibold mb-3 text-gray-800">Bet Details</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-600">Asset:</span>
            <span className="ml-2 text-gray-900">{assetPair}</span>
          </div>
          <div>
            <span className="text-gray-600">Target Price:</span>
            <span className="ml-2 text-gray-900">${targetPriceUSD?.toString() || "0"}</span>
          </div>
          <div>
            <span className="text-gray-600">Start Price:</span>
            <span className="ml-2 text-gray-900">
              $
              {betData?.startPrice && betData?.priceExponent !== undefined
                ? (Number(betData.startPrice) / 10 ** Math.abs(betData.priceExponent)).toFixed(2)
                : "Loading..."}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Player 1 (YES):</span>
            <span className="ml-2 text-gray-900">
              {betData?.player1 ? `${betData.player1.slice(0, 6)}...${betData.player1.slice(-4)}` : "Loading..."}
            </span>
          </div>
          {betData?.player2 && betData.player2 !== "0x0000000000000000000000000000000000000000" && (
            <div>
              <span className="text-gray-600">Player 2 (NO):</span>
              <span className="ml-2 text-gray-900">
                {betData.player2.slice(0, 6)}...{betData.player2.slice(-4)}
              </span>
            </div>
          )}
          <div>
            <span className="text-gray-600">ENS Trophy:</span>
            <span className="ml-2 text-gray-900">
              {betData?.ensSubdomain ? `${betData.ensSubdomain}.betflix.eth` : "Loading..."}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Resolution Time:</span>
            <span className="ml-2">
              <BetTimer deadline={betData.deadline} />
            </span>
          </div>
        </div>
      </div>
    );
  };

  const handleJoinBet = async (betId: string, amount: bigint) => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    setIsJoining(betId);
    try {
      const tx = await writeContractAsync({
        functionName: "joinBet",
        args: [betId as `0x${string}`],
        value: amount,
      });

      notification.success(
        <>
          Successfully joined bet!
          <br />
          <a href={`https://sepolia.etherscan.io/tx/${tx}`} target="_blank" rel="noopener noreferrer" className="link">
            View transaction
          </a>
        </>,
      );
    } catch (error: any) {
      console.error("Error joining bet:", error);
      notification.error(error.message || "Failed to join bet");
    } finally {
      setIsJoining(null);
    }
  };

  const handleResolveBet = async (betId: string, priceFeedId: string) => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    setIsResolving(betId);
    try {
      // Fetch fresh price data
      notification.info("Fetching latest price data...");

      const pythUpdateData = await fetchPythUpdateData(priceFeedId);

      if (!pythUpdateData || pythUpdateData.length === 0) {
        throw new Error("Failed to fetch price data");
      }

      // Estimate Pyth fee
      const pythFee = BigInt(pythUpdateData.length);

      notification.info("Resolving bet...");
      const tx = await writeContractAsync({
        functionName: "resolveBet",
        args: [betId as `0x${string}`, pythUpdateData],
        value: pythFee,
      });

      notification.success(
        <>
          Bet resolved successfully!
          <br />
          <a href={`https://sepolia.etherscan.io/tx/${tx}`} target="_blank" rel="noopener noreferrer" className="link">
            View transaction
          </a>
        </>,
      );
    } catch (error: any) {
      console.error("Error resolving bet:", error);
      notification.error(error.message || "Failed to resolve bet");
    } finally {
      setIsResolving(null);
    }
  };

  const handleCancelBet = async (betId: string) => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    setIsCancelling(betId);
    try {
      const tx = await writeContractAsync({
        functionName: "cancelBet",
        args: [betId as `0x${string}`],
      });

      notification.success(
        <>
          Bet cancelled successfully!
          <br />
          <a href={`https://sepolia.etherscan.io/tx/${tx}`} target="_blank" rel="noopener noreferrer" className="link">
            View transaction
          </a>
        </>,
      );
    } catch (error: any) {
      console.error("Error cancelling bet:", error);
      notification.error(error.message || "Failed to cancel bet");
    } finally {
      setIsCancelling(null);
    }
  };

  const toggleExpanded = (betId: string) => {
    const newExpanded = new Set(expandedBets);
    if (newExpanded.has(betId)) {
      newExpanded.delete(betId);
    } else {
      newExpanded.add(betId);
    }
    setExpandedBets(newExpanded);
  };

  const getTimeRemaining = (deadline: bigint) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const remaining = Number(deadline - now);

    if (remaining <= 0) return "Expired";

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  if (activeBets.length === 0) {
    return (
      <div className="bg-base-100 border border-base-300 rounded-lg p-8 text-center">
        <p className="text-lg text-base-content/70">No active bets yet. Create the first one!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeBets.map(bet => {
        const timeRemaining = getTimeRemaining(bet.deadline);
        const joinTimeRemaining = getTimeRemaining(bet.joinDeadline);
        const isExpired = timeRemaining === "Expired";
        const isJoinExpired = joinTimeRemaining === "Expired";
        const canJoin = !bet.hasJoiner && !isJoinExpired && bet.creator.toLowerCase() !== address?.toLowerCase();
        const canResolve = bet.hasJoiner && isExpired;
        const canCancel = !bet.hasJoiner && isJoinExpired && bet.creator.toLowerCase() === address?.toLowerCase();
        const isExpanded = expandedBets.has(bet.betId);

        return (
          <div
            key={bet.betId}
            className="bg-base-100 border border-base-300 rounded-lg p-6 hover:shadow-md transition-shadow"
          >
            {/* ENS Subdomain */}
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <TrophyIcon className="w-5 h-5 text-gray-700" />
              {bet.ensSubdomain}.betflix.eth
            </h3>

            {/* Bet Details */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Amount:</span>
                <span className="ml-2 font-semibold text-gray-900">{formatEther(bet.amount)} ETH</span>
              </div>
              <div className="flex items-center">
                <UserGroupIcon className="w-4 h-4 mr-1 text-gray-600" />
                <span className="text-gray-900">{bet.hasJoiner ? "2/2" : "1/2"} players</span>
              </div>
              <div className="flex items-center">
                <ClockIcon className="w-4 h-4 mr-1 text-gray-600" />
                <span className={isExpired ? "text-red-600" : "text-gray-900"}>{timeRemaining}</span>
              </div>
              {!bet.hasJoiner && (
                <div className="flex items-center">
                  <span className="text-gray-600">Join by:</span>
                  <span className={`ml-2 ${isJoinExpired ? "text-red-600" : "text-gray-900"}`}>
                    {joinTimeRemaining}
                  </span>
                </div>
              )}
            </div>

            {/* Expand/Collapse Button */}
            <button
              className="text-sm text-gray-600 hover:text-gray-800 transition-colors mt-2"
              onClick={() => toggleExpanded(bet.betId)}
            >
              {isExpanded ? "Hide Details ↑" : "Show Details ↓"}
            </button>

            {/* Expanded Details */}
            {isExpanded && <BetDetails betId={bet.betId} />}

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4">
              {canJoin && (
                <button
                  className={`px-4 py-2 bg-black text-white text-sm rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isJoining === bet.betId ? "opacity-75" : ""
                  }`}
                  onClick={() => handleJoinBet(bet.betId, bet.amount)}
                  disabled={isJoining === bet.betId}
                >
                  {isJoining === bet.betId ? "Joining..." : "Join Bet (I bet NO)"}
                </button>
              )}

              {canResolve && (
                <ResolveBetButton
                  betId={bet.betId}
                  isResolving={isResolving === bet.betId}
                  onResolve={handleResolveBet}
                />
              )}

              {canCancel && (
                <button
                  className={`px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isCancelling === bet.betId ? "opacity-75" : ""
                  }`}
                  onClick={() => handleCancelBet(bet.betId)}
                  disabled={isCancelling === bet.betId}
                >
                  {isCancelling === bet.betId ? "Cancelling..." : "Cancel Bet"}
                </button>
              )}

              {!bet.hasJoiner && !isJoinExpired && (
                <span className="text-sm text-gray-500">Waiting for opponent...</span>
              )}

              {bet.hasJoiner && !isExpired && <span className="text-sm text-amber-600">Bet in progress</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
