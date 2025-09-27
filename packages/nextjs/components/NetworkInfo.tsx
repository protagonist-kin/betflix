"use client";

import { useEffect, useState } from "react";
import { useAccount, useBlockNumber, useChainId, useChains } from "wagmi";

export const NetworkInfo = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const chains = useChains();
  const chain = chains.find(c => c.id === chainId);
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-base-100 border border-base-300 rounded-lg p-4 text-sm shadow-lg">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-gray-600">{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
        {chain && (
          <div className="text-gray-600">
            Network: <span className="font-medium">{chain.name}</span> (ID: {chain.id})
          </div>
        )}
        {blockNumber && (
          <div className="text-gray-600">
            Block: <span className="font-medium">{blockNumber.toString()}</span>
          </div>
        )}
        {address && (
          <div className="text-gray-600">
            Address:{" "}
            <span className="font-medium">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
