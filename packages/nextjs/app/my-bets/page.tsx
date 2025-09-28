"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { ArrowLeftIcon, ClockIcon, TrophyIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { GET_USER_BETS } from "~~/graphql/queries";
import { useSubgraphQuery } from "~~/hooks/useSubgraphQuery";

interface BetData {
  id: string;
  creator?: {
    id: string;
    address: string;
  };
  joiner?: {
    id: string;
    address: string;
  };
  amount: string;
  targetPrice: string;
  assetPair: string;
  deadline: string;
  ensSubdomain: string;
  status: string;
  resolved: boolean;
  cancelled: boolean;
  winner?: {
    id: string;
    address: string;
  };
  createdAt: string;
  joinedAt?: string;
  resolvedAt?: string;
  cancelledAt?: string;
  isCreator?: boolean; // Add this field
}

export default function MyBetsPage() {
  const { address } = useAccount();
  const [filter, setFilter] = useState<"all" | "active" | "won" | "lost">("all");

  const { data, loading, error } = useSubgraphQuery<{
    user: {
      betsCreated: BetData[];
      betsJoined: BetData[];
    };
  }>(GET_USER_BETS, {
    variables: {
      userAddress: address?.toLowerCase() || "",
      first: 30, // Reduced from 100 to 30 for better performance
      skip: 0,
    },
    skip: !address,
    // No automatic polling - only fetch on mount
  });

  const myBets = useMemo(() => {
    if (!address || !data?.user?.betsCreated) return [];

    const userAddress = address.toLowerCase();
    const allBets = [...(data.user.betsCreated || []), ...(data.user.betsJoined || [])];

    return allBets
      .map(bet => ({
        ...bet,
        isCreator: bet.creator?.address.toLowerCase() === userAddress,
      }))
      .filter(bet => {
        if (filter === "all") return true;
        if (filter === "active") return bet.status === "PENDING" || bet.status === "ACTIVE";
        if (filter === "won") return bet.status === "RESOLVED" && bet.winner?.address.toLowerCase() === userAddress;
        if (filter === "lost") return bet.status === "RESOLVED" && bet.winner?.address.toLowerCase() !== userAddress;
        return false;
      })
      .sort((a, b) => parseInt(b.createdAt) - parseInt(a.createdAt));
  }, [data, address, filter]);

  if (!address) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Connect your wallet</h2>
          <p className="text-gray-600">Please connect your wallet to view your betting history</p>
        </div>
      </div>
    );
  }

  const getStatusIcon = (bet: BetData) => {
    if (bet.cancelled) return <XCircleIcon className="w-5 h-5 text-red-500" />;
    if (bet.resolved) {
      const won = bet.winner?.address.toLowerCase() === address?.toLowerCase();
      return won ? (
        <TrophyIcon className="w-5 h-5 text-yellow-500" />
      ) : (
        <XCircleIcon className="w-5 h-5 text-red-500" />
      );
    }
    if (bet.status === "ACTIVE") return <ClockIcon className="w-5 h-5 text-blue-500" />;
    return <ClockIcon className="w-5 h-5 text-gray-500" />;
  };

  const getStatusText = (bet: BetData) => {
    if (bet.cancelled) return "Cancelled";
    if (bet.resolved) {
      const won = bet.winner?.address.toLowerCase() === address?.toLowerCase();
      return won ? "Won" : "Lost";
    }
    if (bet.status === "ACTIVE") return "Active";
    return "Pending";
  };

  const getStatusColor = (bet: BetData) => {
    if (bet.cancelled) return "text-red-600 bg-red-50";
    if (bet.resolved) {
      const won = bet.winner?.address.toLowerCase() === address?.toLowerCase();
      return won ? "text-yellow-600 bg-yellow-50" : "text-red-600 bg-red-50";
    }
    if (bet.status === "ACTIVE") return "text-blue-600 bg-blue-50";
    return "text-gray-600 bg-gray-50";
  };

  const stats = {
    total: myBets.length,
    active: myBets.filter(b => b.status === "PENDING" || b.status === "ACTIVE").length,
    won: myBets.filter(b => b.resolved && b.winner?.address.toLowerCase() === address?.toLowerCase()).length,
    lost: myBets.filter(b => b.resolved && b.winner?.address.toLowerCase() !== address?.toLowerCase()).length,
  };

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 max-w-6xl w-full">
        {/* Header with back button */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeftIcon className="w-5 h-5" />
            Back to Bets
          </Link>
          <h1 className="text-4xl font-bold">My Betting History</h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Bets</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.active}</div>
            <div className="text-sm text-gray-600">Active Bets</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{stats.won}</div>
            <div className="text-sm text-gray-600">Bets Won</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">{stats.lost}</div>
            <div className="text-sm text-gray-600">Bets Lost</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          {(["all", "active", "won", "lost"] as const).map(tab => (
            <button
              key={tab}
              className={`pb-2 px-1 font-medium capitalize transition-colors ${
                filter === tab ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-600 hover:text-gray-900"
              }`}
              onClick={() => setFilter(tab)}
            >
              {tab} ({tab === "all" ? stats.total : stats[tab]})
            </button>
          ))}
        </div>

        {/* Bets List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-600">Error loading bets: {error.message}</div>
        ) : myBets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {filter === "all" ? "You haven't placed any bets yet." : `No ${filter} bets found.`}
          </div>
        ) : (
          <div className="space-y-4">
            {myBets.map((bet: BetData) => {
              const opponent = bet.isCreator ? bet.joiner : bet.creator;
              const position = bet.isCreator ? "YES" : "NO";

              return (
                <div
                  key={bet.id}
                  className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-semibold text-gray-900">{bet.assetPair}</span>
                        <span className={`text-sm px-2 py-1 rounded ${getStatusColor(bet)}`}>
                          {getStatusIcon(bet)}
                          <span className="ml-1">{getStatusText(bet)}</span>
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Target: {bet.targetPrice} • Position: {position}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">{formatEther(BigInt(bet.amount))} ETH</div>
                      <div className="text-sm text-gray-600">
                        {new Date(parseInt(bet.createdAt) * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Your Role:</span>
                      <div className="text-gray-900 font-medium">{bet.isCreator ? "Creator" : "Joiner"}</div>
                    </div>
                    {opponent && (
                      <div>
                        <span className="text-gray-600">Opponent:</span>
                        <div className="text-gray-900">
                          {opponent.address.slice(0, 6)}...{opponent.address.slice(-4)}
                        </div>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-600">ENS Trophy:</span>
                      <div className="text-gray-900">{bet.ensSubdomain}.betflix.eth</div>
                    </div>
                  </div>

                  {bet.resolved && bet.winner && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          Winner: {bet.winner.address.slice(0, 6)}...{bet.winner.address.slice(-4)}
                        </span>
                        {bet.winner.address.toLowerCase() === address?.toLowerCase() && (
                          <span className="text-sm font-medium text-green-600">
                            Won {formatEther(BigInt(bet.amount) * 2n)} ETH
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
