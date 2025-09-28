"use client";

import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { CheckCircleIcon, ClockIcon, TrophyIcon, UserGroupIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { BetTimer } from "~~/components/betflix/BetTimer";
import { GET_ALL_ACTIVE_BETS } from "~~/graphql/queries";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useSubgraphQuery } from "~~/hooks/useSubgraphQuery";
import { notification } from "~~/utils/scaffold-eth";

interface BetData {
  id: string;
  creator: {
    id: string;
    address: string;
  };
  joiner?: {
    id: string;
    address: string;
  };
  amount: string;
  targetPrice: string;
  targetPriceUSD: string;
  startPrice: string;
  priceExponent: number;
  priceFeedId: string;
  assetPair: string;
  deadline: string;
  joinDeadline: string;
  ensSubdomain: string;
  status: string;
  createdAt: string;
  createdTx: string;
}

// Map price feed IDs to readable asset pairs
const getPriceFeedAssetPair = (priceFeedId: string): string => {
  // Remove 0x prefix if present
  const id = priceFeedId.startsWith("0x") ? priceFeedId.slice(2) : priceFeedId;
  
  if (id === "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace") {
    return "ETH/USD";
  } else if (id === "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43") {
    return "BTC/USD";
  }
  return "Unknown";
};

// Resolve Bet Button Component
const ResolveBetButton = ({
  betId,
  deadline,
  priceFeedId,
  isResolving,
  onResolve,
}: {
  betId: string;
  deadline: string;
  priceFeedId: string;
  isResolving: boolean;
  onResolve: (betId: string, priceFeedId: string) => void;
}) => {
  const [canResolve, setCanResolve] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm">
        <span className="text-gray-600">Time left: </span>
        <BetTimer deadline={BigInt(deadline)} onExpired={() => setCanResolve(true)} />
      </div>
      <button
        className={`px-4 py-2 text-white text-sm rounded-lg font-medium transition-all ${
          canResolve && !isResolving
            ? "bg-green-600 hover:bg-green-700 cursor-pointer"
            : "bg-gray-500 cursor-not-allowed opacity-50"
        }`}
        onClick={() => canResolve && onResolve(betId, priceFeedId)}
        disabled={!canResolve || isResolving}
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
  const [activeTab, setActiveTab] = useState<"pending" | "matched">("pending");

  const { writeContractAsync } = useScaffoldWriteContract("Betflix");

  // Fetch active bets from subgraph (single query for both pending and matched)
  const {
    data: betsData,
    loading: betsLoading,
    refetch: refetchBets,
  } = useSubgraphQuery<{ pendingBets: BetData[]; matchedBets: BetData[] }>(GET_ALL_ACTIVE_BETS, {
    variables: { first: 100, skip: 0 },
    // No automatic polling - only fetch on mount and manual refresh
  });

  const fetchPythUpdateData = async (priceFeedId: string) => {
    try {
      const response = await fetch("/api/pyth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: priceFeedId }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch Pyth data");
      }

      const data = await response.json();
      return data.updateData;
    } catch (error) {
      console.error("Error fetching Pyth update data:", error);
      notification.error("Failed to fetch price data");
      return null;
    }
  };

  const handleJoinBet = async (betId: string, amount: string) => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    setIsJoining(betId);
    try {
      const tx = await writeContractAsync({
        functionName: "joinBet",
        args: [betId as `0x${string}`],
        value: BigInt(amount),
      });

      notification.success(
        <>
          Bet joined successfully!
          <br />
          <a href={`https://sepolia.etherscan.io/tx/${tx}`} target="_blank" rel="noopener noreferrer" className="link">
            View transaction
          </a>
        </>,
      );

      // Refetch data
      refetchBets();
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
      const pythUpdateData = await fetchPythUpdateData(priceFeedId);
      if (!pythUpdateData) {
        throw new Error("Failed to fetch price data");
      }

      // Calculate Pyth fee
      const pythFee = BigInt(pythUpdateData.length);

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

      // Refetch data
      refetchBets();
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

      // Refetch data
      refetchBets();
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

  const getTimeRemaining = (deadline: string) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const deadlineBigInt = BigInt(deadline);
    const remaining = Number(deadlineBigInt - now);

    if (remaining <= 0) return "Expired";
    if (remaining < 60) return `${remaining}s`;
    if (remaining < 3600) return `${Math.floor(remaining / 60)}m`;
    return `${Math.floor(remaining / 3600)}h`;
  };

  const pendingBets = betsData?.pendingBets || [];
  const matchedBets = betsData?.matchedBets || [];

  if (!address) {
    return (
      <div className="bg-base-100 border border-base-300 rounded-xl p-8 text-center">
        <p className="text-gray-600">Connect your wallet to view active bets</p>
      </div>
    );
  }

  return (
    <div className="bg-base-100 border border-base-300 rounded-xl p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-base-content">Active Bets</h2>
        <button
          onClick={() => refetchBets()}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
          disabled={betsLoading}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6 border-b border-base-300">
        <button
          className={`pb-2 px-1 font-medium transition-colors ${
            activeTab === "pending"
              ? "text-primary border-b-2 border-primary"
              : "text-base-content/70 hover:text-base-content"
          }`}
          onClick={() => setActiveTab("pending")}
        >
          Pending Bets ({pendingBets.length})
        </button>
        <button
          className={`pb-2 px-1 font-medium transition-colors ${
            activeTab === "matched"
              ? "text-primary border-b-2 border-primary"
              : "text-base-content/70 hover:text-base-content"
          }`}
          onClick={() => setActiveTab("matched")}
        >
          Matched Bets ({matchedBets.length})
        </button>
      </div>

      {/* Loading State */}
      {betsLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Bets List */}
      <div className="space-y-4">
        {activeTab === "pending" &&
          pendingBets.map((bet: BetData) => {
            const isExpanded = expandedBets.has(bet.id);
            const timeRemaining = getTimeRemaining(bet.joinDeadline);
            const isJoinExpired = timeRemaining === "Expired";
            const canJoin = !isJoinExpired && bet.creator.address.toLowerCase() !== address?.toLowerCase();
            const canCancel = bet.creator.address.toLowerCase() === address?.toLowerCase() && isJoinExpired;

            return (
              <div key={bet.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                {/* Bet Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-semibold text-gray-900">{bet.assetPair}</span>
                      <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        Waiting for opponent
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">Target: ${bet.targetPriceUSD}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">{formatEther(BigInt(bet.amount))} ETH</div>
                    <div className="text-sm text-gray-600">
                      Join by: {isJoinExpired ? <span className="text-red-600">Expired</span> : timeRemaining}
                    </div>
                  </div>
                </div>

                {/* Bet Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-gray-600">Creator:</span>
                    <div className="text-gray-900">
                      {bet.creator.address.slice(0, 6)}...{bet.creator.address.slice(-4)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">ENS Trophy:</span>
                    <div className="text-gray-900">{bet.ensSubdomain}.betflix.eth</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Duration:</span>
                    <div className="text-gray-900">{getTimeRemaining(bet.deadline)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Created:</span>
                    <div className="text-gray-900">{new Date(parseInt(bet.createdAt) * 1000).toLocaleTimeString()}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  {canJoin && (
                    <button
                      className={`px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-focus transition-colors ${
                        isJoining === bet.id ? "opacity-75 cursor-not-allowed" : ""
                      }`}
                      onClick={() => handleJoinBet(bet.id, bet.amount)}
                      disabled={isJoining === bet.id}
                    >
                      {isJoining === bet.id ? "Joining..." : "Join Bet"}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      className={`px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors ${
                        isCancelling === bet.id ? "opacity-75 cursor-not-allowed" : ""
                      }`}
                      onClick={() => handleCancelBet(bet.id)}
                      disabled={isCancelling === bet.id}
                    >
                      {isCancelling === bet.id ? "Cancelling..." : "Cancel Bet"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

        {activeTab === "matched" &&
          matchedBets.map((bet: BetData) => {
            const isExpanded = expandedBets.has(bet.id);

            return (
              <div key={bet.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                {/* Bet Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-semibold text-gray-900">{bet.assetPair}</span>
                      <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>
                    </div>
                    <div className="text-sm text-gray-600">Target: ${bet.targetPriceUSD}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">
                      {formatEther(BigInt(bet.amount) * 2n)} ETH
                    </div>
                    <div className="text-sm text-gray-600">Total Pot</div>
                  </div>
                </div>

                {/* Players */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-600 mb-1">Player 1 (YES)</div>
                    <div className="font-medium text-gray-900">
                      {bet.creator.address.slice(0, 6)}...{bet.creator.address.slice(-4)}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-600 mb-1">Player 2 (NO)</div>
                    <div className="font-medium text-gray-900">
                      {bet.joiner?.address.slice(0, 6)}...{bet.joiner?.address.slice(-4)}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    ENS Trophy: <span className="font-medium">{bet.ensSubdomain}.betflix.eth</span>
                  </div>
                  <ResolveBetButton
                    betId={bet.id}
                    deadline={bet.deadline}
                    priceFeedId={bet.priceFeedId}
                    isResolving={isResolving === bet.id}
                    onResolve={handleResolveBet}
                  />
                </div>
              </div>
            );
          })}

        {/* Empty States */}
        {activeTab === "pending" && pendingBets.length === 0 && !betsLoading && (
          <div className="text-center py-8 text-gray-500">No pending bets available. Create one to get started!</div>
        )}

        {activeTab === "matched" && matchedBets.length === 0 && !betsLoading && (
          <div className="text-center py-8 text-gray-500">
            No matched bets yet. Join a pending bet to start playing!
          </div>
        )}
      </div>
    </div>
  );
};
