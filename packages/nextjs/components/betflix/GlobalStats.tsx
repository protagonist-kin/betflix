"use client";

import { formatEther } from "viem";
import { GET_GLOBAL_STATS } from "~~/graphql/queries";
import { useSubgraphQuery } from "~~/hooks/useSubgraphQuery";

export const GlobalStats = () => {
  const { data, loading } = useSubgraphQuery<{
    globalStats: {
      totalBets: string;
      totalActiveBets: string;
      totalResolvedBets: string;
      totalCancelledBets: string;
      totalVolume: string;
    };
  }>(GET_GLOBAL_STATS, {
    // No automatic polling - only fetch on mount
  });

  const stats = data?.globalStats;

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 animate-pulse">
        <div className="bg-gray-200 h-24 rounded-lg"></div>
        <div className="bg-gray-200 h-24 rounded-lg"></div>
        <div className="bg-gray-200 h-24 rounded-lg"></div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-2xl font-bold text-gray-900">{stats.totalBets.toString()}</div>
        <div className="text-sm text-gray-600">Total Bets</div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-2xl font-bold text-gray-900">{stats.totalActiveBets.toString()}</div>
        <div className="text-sm text-gray-600">Active Bets</div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-2xl font-bold text-gray-900">{formatEther(BigInt(stats.totalVolume || "0"))} ETH</div>
        <div className="text-sm text-gray-600">Total Volume</div>
      </div>
    </div>
  );
};
