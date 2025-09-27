"use client";

import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { ClockIcon, TrophyIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

interface BetHistory {
  betId: string;
  targetPrice: bigint;
  amount: bigint;
  deadline: bigint;
  ensSubdomain: string;
  status: "active" | "won" | "lost" | "cancelled" | "unmatched";
  payout?: bigint;
  finalPrice?: bigint;
  role: "creator" | "joiner";
}

export default function MyBetsPage() {
  const { address } = useAccount();
  const [filter, setFilter] = useState<"all" | "active" | "won" | "lost">("all");

  // Get all events
  const { data: betCreatedEvents } = useScaffoldEventHistory({
    contractName: "Betflix",
    eventName: "BetCreated",
    fromBlock: 7200000n, // Recent block on Sepolia
    watch: true,
  });

  const { data: betJoinedEvents } = useScaffoldEventHistory({
    contractName: "Betflix",
    eventName: "BetJoined",
    fromBlock: 7200000n,
    watch: true,
  });

  const { data: betResolvedEvents } = useScaffoldEventHistory({
    contractName: "Betflix",
    eventName: "BetResolved",
    fromBlock: 7200000n,
    watch: true,
  });

  const { data: betCancelledEvents } = useScaffoldEventHistory({
    contractName: "Betflix",
    eventName: "BetCancelled",
    fromBlock: 7200000n,
    watch: true,
  });

  // Process events to build bet history
  const myBets = useMemo(() => {
    console.log("Processing my bets:", {
      address,
      betCreatedEvents: betCreatedEvents?.length || 0,
      betJoinedEvents: betJoinedEvents?.length || 0,
      betResolvedEvents: betResolvedEvents?.length || 0,
      betCancelledEvents: betCancelledEvents?.length || 0,
    });

    // Debug first few created events
    if (betCreatedEvents && betCreatedEvents.length > 0) {
      console.log(
        "Sample created events:",
        betCreatedEvents.slice(0, 3).map(e => ({
          betId: e.args.betId,
          creator: e.args.creator,
          blockNumber: e.blockNumber,
        })),
      );
    }

    if (!address) return [];

    const userAddress = address.toLowerCase();
    const betsMap = new Map<string, BetHistory>();

    // Process created bets
    betCreatedEvents?.forEach(event => {
      console.log("Processing created event:", {
        creator: event.args.creator,
        userAddress,
        matches: event.args.creator?.toLowerCase() === userAddress,
      });
      if (event.args.creator?.toLowerCase() === userAddress) {
        betsMap.set(event.args.betId!, {
          betId: event.args.betId!,
          targetPrice: event.args.targetPrice!,
          amount: event.args.amount!,
          deadline: event.args.deadline!,
          ensSubdomain: event.args.ensSubdomain!,
          status: "active",
          role: "creator",
        });
      }
    });

    // Process joined bets
    betJoinedEvents?.forEach(event => {
      if (event.args.joiner?.toLowerCase() === userAddress) {
        // Find the corresponding created event to get bet details
        const createdEvent = betCreatedEvents?.find(e => e.args.betId === event.args.betId);
        if (createdEvent) {
          betsMap.set(event.args.betId!, {
            betId: event.args.betId!,
            targetPrice: createdEvent.args.targetPrice!,
            amount: createdEvent.args.amount!,
            deadline: createdEvent.args.deadline!,
            ensSubdomain: createdEvent.args.ensSubdomain!,
            status: "active",
            role: "joiner",
          });
        }
      } else {
        // Mark creator's bet as matched
        const bet = betsMap.get(event.args.betId!);
        if (bet && bet.role === "creator") {
          bet.status = "active";
        }
      }
    });

    // Process resolved bets
    betResolvedEvents?.forEach(event => {
      const bet = betsMap.get(event.args.betId!);
      if (bet) {
        const isWinner = event.args.winner?.toLowerCase() === userAddress;
        bet.status = isWinner ? "won" : "lost";
        bet.payout = event.args.payout;
        bet.finalPrice = event.args.finalPrice;
      }
    });

    // Process cancelled bets
    betCancelledEvents?.forEach(event => {
      const bet = betsMap.get(event.args.betId!);
      if (bet) {
        bet.status = "cancelled";
      }
    });

    // Check for unmatched expired bets
    const now = BigInt(Math.floor(Date.now() / 1000));
    betsMap.forEach(bet => {
      if (bet.status === "active") {
        const hasJoiner = betJoinedEvents?.some(e => e.args.betId === bet.betId);
        if (!hasJoiner && bet.deadline < now) {
          bet.status = "unmatched";
        }
      }
    });

    return Array.from(betsMap.values()).reverse();
  }, [address, betCreatedEvents, betJoinedEvents, betResolvedEvents, betCancelledEvents]);

  const filteredBets = myBets.filter(bet => {
    if (filter === "all") return true;
    if (filter === "active") return bet.status === "active";
    if (filter === "won") return bet.status === "won";
    if (filter === "lost") return bet.status === "lost";
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "won":
        return <TrophyIcon className="w-5 h-5 text-success" />;
      case "lost":
        return <XCircleIcon className="w-5 h-5 text-error" />;
      case "cancelled":
      case "unmatched":
        return <XCircleIcon className="w-5 h-5 text-base-300" />;
      case "active":
        return <ClockIcon className="w-5 h-5 text-warning" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "won":
        return "Won";
      case "lost":
        return "Lost";
      case "cancelled":
        return "Cancelled";
      case "unmatched":
        return "Unmatched";
      case "active":
        return "Active";
      default:
        return status;
    }
  };

  if (!address) {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">My Bets</h1>
          <p className="text-lg opacity-70">Please connect your wallet to view your bets</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 max-w-4xl w-full">
        <h1 className="text-4xl font-bold mb-8">My Bets</h1>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg inline-flex">
          <button
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              filter === "all" ? "bg-white text-black shadow-sm" : "text-gray-600 hover:text-gray-800"
            }`}
            onClick={() => setFilter("all")}
          >
            All ({myBets.length})
          </button>
          <button
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              filter === "active" ? "bg-white text-black shadow-sm" : "text-gray-600 hover:text-gray-800"
            }`}
            onClick={() => setFilter("active")}
          >
            Active ({myBets.filter(b => b.status === "active").length})
          </button>
          <button
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              filter === "won" ? "bg-white text-black shadow-sm" : "text-gray-600 hover:text-gray-800"
            }`}
            onClick={() => setFilter("won")}
          >
            Won ({myBets.filter(b => b.status === "won").length})
          </button>
          <button
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              filter === "lost" ? "bg-white text-black shadow-sm" : "text-gray-600 hover:text-gray-800"
            }`}
            onClick={() => setFilter("lost")}
          >
            Lost ({myBets.filter(b => b.status === "lost").length})
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-gray-600 text-sm">Total Bets</div>
            <div className="text-3xl font-bold text-black mt-1">{myBets.length}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-gray-600 text-sm">Wins</div>
            <div className="text-3xl font-bold text-green-600 mt-1">
              {myBets.filter(b => b.status === "won").length}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-gray-600 text-sm">Win Rate</div>
            <div className="text-3xl font-bold text-black mt-1">
              {myBets.length > 0
                ? Math.round(
                    (myBets.filter(b => b.status === "won").length /
                      myBets.filter(b => ["won", "lost"].includes(b.status)).length) *
                      100,
                  ) || 0
                : 0}
              %
            </div>
          </div>
        </div>

        {/* Bets List */}
        {filteredBets.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-lg text-gray-500">No bets found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBets.map(bet => (
              <div
                key={bet.betId}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        {getStatusIcon(bet.status)}
                        {bet.ensSubdomain}.betflix.eth
                      </h3>
                      <div className="mt-2 space-y-1 text-sm">
                        <p>
                          <span className="text-gray-600">Role:</span>{" "}
                          <span className="font-medium text-gray-900">
                            {bet.role === "creator" ? "Created (YES)" : "Joined (NO)"}
                          </span>
                        </p>
                        <p>
                          <span className="text-gray-600">Amount:</span>{" "}
                          <span className="font-medium text-gray-900">{formatEther(bet.amount)} ETH</span>
                        </p>
                        <p>
                          <span className="text-gray-600">Target Price:</span>{" "}
                          <span className="font-medium text-gray-900">
                            ${(Number(bet.targetPrice) / 10 ** 8).toFixed(2)}
                          </span>
                        </p>
                        {bet.finalPrice && (
                          <p>
                            <span className="text-gray-600">Final Price:</span>{" "}
                            <span className="font-medium text-gray-900">
                              ${(Number(bet.finalPrice) / 10 ** 8).toFixed(2)}
                            </span>
                          </p>
                        )}
                        {bet.status === "won" && bet.payout && (
                          <p className="text-green-700">
                            <span className="text-gray-600">Payout:</span>{" "}
                            <span className="font-bold">{formatEther(bet.payout)} ETH</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          bet.status === "won"
                            ? "bg-green-100 text-green-800"
                            : bet.status === "lost"
                              ? "bg-red-100 text-red-800"
                              : bet.status === "active"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {getStatusText(bet.status)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
