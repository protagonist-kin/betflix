"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { ChartBarIcon, TrophyIcon } from "@heroicons/react/24/outline";
import { ErrorBoundary } from "~~/components/ErrorBoundary";
import { NetworkInfo } from "~~/components/NetworkInfo";
import { ActiveBets } from "~~/components/betflix/ActiveBets";
import { CreateBet } from "~~/components/betflix/CreateBet";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5 max-w-7xl w-full">
          <h1 className="text-center mb-8">
            <span className="block text-6xl font-bold text-base-content">Betflix</span>
            <span className="block text-2xl mt-2 text-base-content/70 font-light">
              Real-time micro-betting on price movements
            </span>
          </h1>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Create Bet Section */}
            <div className="lg:col-span-2">
              <h2 className="text-3xl font-bold mb-4">Create a Bet</h2>
              <ErrorBoundary>
                <CreateBet />
              </ErrorBoundary>
            </div>

            {/* Info Section */}
            <div className="space-y-6">
              {/* How It Works */}
              <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl p-6 border-2 border-primary/20">
                <div className="flex items-center mb-3">
                  <ChartBarIcon className="h-6 w-6 text-primary" />
                  <h3 className="text-lg font-bold ml-2">How It Works</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-primary font-semibold">1. Create</span>
                    <p className="text-base-content/70">Set target price & deadline</p>
                  </div>
                  <div>
                    <span className="text-primary font-semibold">2. Join</span>
                    <p className="text-base-content/70">Take opposite position</p>
                  </div>
                  <div>
                    <span className="text-primary font-semibold">3. Win</span>
                    <p className="text-base-content/70">Winner takes all</p>
                  </div>
                </div>
              </div>

              {/* ENS Trophies */}
              <div className="bg-gradient-to-r from-warning/10 to-success/10 rounded-2xl p-6 border-2 border-warning/20">
                <div className="flex items-center mb-3">
                  <TrophyIcon className="h-6 w-6 text-warning" />
                  <h3 className="text-lg font-bold ml-2">Win ENS Trophies</h3>
                </div>
                <p className="text-sm text-base-content/70">
                  🏆 Every win awards a unique ENS subdomain as your permanent trophy!
                </p>
              </div>
            </div>
          </div>

          {/* Active Bets Section */}
          <div>
            <h2 className="text-3xl font-bold mb-4">Active Bets</h2>
            <ErrorBoundary>
              <ActiveBets />
            </ErrorBoundary>
          </div>

          {/* Debug Link */}
          <div className="text-center mt-8">
            <Link href="/debug" className="link link-primary text-sm">
              Debug Contracts →
            </Link>
          </div>
        </div>
      </div>
      <NetworkInfo />
    </>
  );
};

export default Home;
