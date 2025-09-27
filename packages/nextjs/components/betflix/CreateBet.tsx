"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { CheckCircleIcon, ClockIcon, CurrencyDollarIcon, TrophyIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

// Price feed IDs for different assets
const PRICE_FEEDS = {
  "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
};

export const CreateBet = () => {
  const { address } = useAccount();
  const [targetPrice, setTargetPrice] = useState("");
  const [betAmount, setBetAmount] = useState("0.01");
  const [duration, setDuration] = useState("300"); // 5 minutes default
  const [joinDuration, setJoinDuration] = useState("60"); // 1 minute default
  const [ensSubdomain, setEnsSubdomain] = useState("");
  const [selectedFeed, setSelectedFeed] = useState("ETH/USD");
  const [isCreating, setIsCreating] = useState(false);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);
  const [lastTxHash, setLastTxHash] = useState("");

  const { writeContractAsync } = useScaffoldWriteContract("Betflix");

  // Check subdomain availability
  const { data: isSubdomainAvailable, error: subdomainError } = useScaffoldReadContract({
    contractName: "Betflix",
    functionName: "isSubdomainAvailable",
    args: ensSubdomain && address ? [ensSubdomain.toLowerCase()] : [undefined],
  });

  // Get full ENS domain
  const { data: fullDomain, error: domainError } = useScaffoldReadContract({
    contractName: "Betflix",
    functionName: "getFullENSDomain",
    args: ensSubdomain && address ? [ensSubdomain.toLowerCase()] : [undefined],
  });

  // Check if ENS is configured on the contract
  const { data: ensDomainName, error: ensConfigError } = useScaffoldReadContract({
    contractName: "Betflix",
    functionName: "ensDomainName",
  });

  const fetchPythUpdateData = async () => {
    try {
      const response = await fetch("/api/pyth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: PRICE_FEEDS[selectedFeed as keyof typeof PRICE_FEEDS] }),
      });

      if (!response.ok) throw new Error("Failed to fetch price data");

      const data = await response.json();
      return data.updateData;
    } catch (error) {
      console.error("Error fetching Pyth data:", error);
      throw error;
    }
  };

  const handleCreateBet = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!targetPrice || parseFloat(targetPrice) <= 0) {
      notification.error("Please enter a valid target price");
      return;
    }

    if (parseFloat(betAmount) < 0.0000000001) {
      notification.error("Minimum bet amount is 0.0000000001 ETH");
      return;
    }

    if (!ensSubdomain || ensSubdomain.length === 0) {
      notification.error("Please enter an ENS subdomain");
      return;
    }

    // Validate ENS subdomain format
    if (ensSubdomain.length > 63) {
      notification.error("ENS subdomain must be 63 characters or less");
      return;
    }

    // Check for invalid characters - ENS only allows lowercase letters, numbers, and hyphens
    // but cannot start or end with a hyphen
    // const ensRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    // if (!ensRegex.test(ensSubdomain.toLowerCase())) {
    //   notification.error("ENS subdomain can only contain lowercase letters, numbers, and hyphens (not at start/end)");
    //   return;
    // }
    // Temporarily disabled to debug the issue

    if (!isSubdomainAvailable) {
      notification.error("This subdomain is already taken");
      return;
    }

    // Check if ENS is configured
    if (!ensDomainName || ensDomainName === "") {
      notification.warning("ENS is not configured on this contract. Please configure ENS first.");
      // Still allow bet creation but warn the user
    }

    setIsCreating(true);
    const normalizedSubdomain = ensSubdomain.toLowerCase().trim();

    try {
      // Fetch fresh price data from Pyth
      notification.info("Fetching latest price data...");
      const pythUpdateData = await fetchPythUpdateData();

      if (!pythUpdateData || pythUpdateData.length === 0) {
        throw new Error("Failed to fetch price data");
      }

      console.log("Pyth update data received:", {
        count: pythUpdateData.length,
        firstItem: pythUpdateData[0]?.substring(0, 20) + "...",
      });

      // Pyth fee is per price update, not per byte
      // For Sepolia, the fee is typically 1 wei per price feed update
      const pythFee = BigInt(1); // 1 wei per price feed
      const totalValue = parseEther(betAmount) + pythFee;

      notification.info("Creating bet...");

      // Debug logging
      console.log("Creating bet with params:", {
        pythUpdateData: pythUpdateData.length,
        priceFeed: PRICE_FEEDS[selectedFeed as keyof typeof PRICE_FEEDS],
        targetPrice: BigInt(Math.floor(parseFloat(targetPrice))),
        duration: BigInt(duration),
        joinDuration: BigInt(joinDuration),
        ensSubdomain: normalizedSubdomain,
        ensSubdomainRaw: ensSubdomain,
        ensSubdomainLength: normalizedSubdomain.length,
        ensSubdomainBytes: `0x${Buffer.from(normalizedSubdomain).toString("hex")}`,
        ensSubdomainCharCodes: Array.from(normalizedSubdomain).map(c => c.charCodeAt(0)),
        value: totalValue.toString(),
      });

      // Test subdomain validation
      console.log("Subdomain validation check:", {
        isEmpty: normalizedSubdomain.length === 0,
        isTooLong: normalizedSubdomain.length > 63,
        wouldRevert: normalizedSubdomain.length === 0 || normalizedSubdomain.length > 63,
      });

      const tx = await writeContractAsync({
        functionName: "createBet",
        args: [
          pythUpdateData,
          PRICE_FEEDS[selectedFeed as keyof typeof PRICE_FEEDS] as `0x${string}`,
          BigInt(Math.floor(parseFloat(targetPrice))), // Target price in whole USD
          BigInt(duration),
          BigInt(joinDuration),
          normalizedSubdomain, // Use normalized subdomain
        ],
        value: totalValue,
      });

      if (tx) {
        setLastTxHash(tx);
        notification.success(
          <>
            Bet created successfully!
            <br />
            <a
              href={`https://sepolia.etherscan.io/tx/${tx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              View transaction
            </a>
          </>,
        );
      }

      // Reset form
      setTargetPrice("");
      setBetAmount("0.01");
      setDuration("300");
      setJoinDuration("60");
      setEnsSubdomain("");
    } catch (error: any) {
      console.error("Error creating bet:", error);

      // Handle specific error codes
      console.log("Full error object:", error);
      console.log("Error cause:", error?.cause);
      console.log("Error signature:", error?.cause?.signature);
      console.log("Error data:", error?.data);
      console.log("Error shortMessage:", error?.shortMessage);
      console.log("ENS subdomain that failed:", ensSubdomain);
      console.log("ENS subdomain normalized:", normalizedSubdomain);
      console.log("ENS subdomain bytes:", new TextEncoder().encode(normalizedSubdomain));

      // Try to decode the error
      if (error?.data) {
        console.log("Raw error data:", error.data);
      }

      // Check for specific error patterns in the message
      const errorStr = error?.toString() || "";
      const errorMessage = error?.message || "";

      if (error?.cause?.reason) {
        notification.error(`Failed: ${error.cause.reason}`);
      } else if (
        error?.cause?.signature === "0x6ce2251a" ||
        errorStr.includes("0x6ce2251a") ||
        errorMessage.includes("0x6ce2251a")
      ) {
        // This is InvalidENSSubdomain error
        notification.error(`Invalid ENS subdomain: "${ensSubdomain}". Must be 1-63 characters.`);
      } else if (error?.cause?.signature === "0xda322303") {
        // ENSSubdomainTaken error
        notification.error("This ENS subdomain is already taken. Please choose another.");
      } else if (error?.cause?.signature === "0x65074bf6") {
        // BetAmountTooLow error
        notification.error("Bet amount is too low. Minimum is 0.01 ETH.");
      } else if (error?.cause?.signature === "0x816e39a8") {
        // InsufficientPythFee error
        notification.error("Insufficient funds to cover Pyth oracle fee. Add more ETH.");
      } else if (error?.message?.includes("user rejected")) {
        notification.error("Transaction cancelled by user");
      } else if (error?.message?.includes("0x6ce2251a")) {
        // Error signature might be in the message
        notification.error("Invalid ENS subdomain. Subdomain can only be empty or too long (>63 chars)");
      } else {
        notification.error(`Failed to create bet: ${error?.message || "Unknown error"}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const durationOptions = [
    { label: "1 minute", value: "60" },
    { label: "5 minutes", value: "300" },
    { label: "15 minutes", value: "900" },
    { label: "30 minutes", value: "1800" },
    { label: "1 hour", value: "3600" },
  ];

  const joinDurationOptions = [
    { label: "1 minute", value: "60" },
    { label: "2 minutes", value: "120" },
    { label: "5 minutes", value: "300" },
    { label: "10 minutes", value: "600" },
  ];

  return (
    <div className="bg-base-100 border border-base-300 rounded-lg p-6">
      <h3 className="text-xl font-bold mb-6">Create a New Bet</h3>

      {/* Asset Selection */}
      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">Select Asset</span>
        </label>
        <select
          className="select select-bordered w-full"
          value={selectedFeed}
          onChange={e => setSelectedFeed(e.target.value)}
        >
          <option value="ETH/USD">ETH/USD</option>
          <option value="BTC/USD">BTC/USD</option>
        </select>
      </div>

      {/* Target Price Input */}
      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">Target Price (USD)</span>
          <CurrencyDollarIcon className="w-5 h-5" />
        </label>
        <input
          type="number"
          placeholder={selectedFeed === "ETH/USD" ? "2500" : "50000"}
          className="input input-bordered w-full"
          value={targetPrice}
          onChange={e => setTargetPrice(e.target.value)}
          step="1"
        />
        <label className="label">
          <span className="label-text-alt">Price {selectedFeed.split("/")[0]} must reach to win</span>
        </label>
      </div>

      {/* Bet Amount Input */}
      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">Bet Amount (ETH)</span>
        </label>
        <input
          type="number"
          placeholder="0.01"
          className="input input-bordered w-full"
          value={betAmount}
          onChange={e => setBetAmount(e.target.value)}
          step="0.01"
          min="0.01"
        />
        <label className="label">
          <span className="label-text-alt">Minimum: 0.0000000001 ETH</span>
        </label>
      </div>

      {/* Duration Selection */}
      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">Bet Duration</span>
          <ClockIcon className="w-5 h-5" />
        </label>
        <select className="select select-bordered w-full" value={duration} onChange={e => setDuration(e.target.value)}>
          {durationOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Join Duration Selection */}
      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">Join Window</span>
          <span className="label-text-alt">How long others can join</span>
        </label>
        <select
          className="select select-bordered w-full"
          value={joinDuration}
          onChange={e => setJoinDuration(e.target.value)}
        >
          {joinDurationOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* ENS Subdomain Input */}
      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">ENS Trophy Name</span>
          <TrophyIcon className="w-5 h-5" />
        </label>
        <input
          type="text"
          placeholder="epic-eth-bet"
          className={`input input-bordered w-full ${ensSubdomain && !isSubdomainAvailable ? "input-error" : ""}`}
          value={ensSubdomain}
          onChange={e => setEnsSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          maxLength={63}
        />
        <label className="label">
          {ensSubdomain && (
            <span className={`label-text-alt ${isSubdomainAvailable ? "text-success" : "text-error"}`}>
              {isSubdomainAvailable ? (
                <>
                  <CheckCircleIcon className="w-4 h-4 inline mr-1" />
                  {fullDomain || `${ensSubdomain}.betflix.eth`} is available
                </>
              ) : (
                <>
                  <XCircleIcon className="w-4 h-4 inline mr-1" />
                  This subdomain is already taken
                </>
              )}
            </span>
          )}
          {!ensSubdomain && <span className="label-text-alt">Winner receives this ENS subdomain</span>}
        </label>
      </div>

      {/* Create Button */}
      <button
        className={`w-full py-3 px-4 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isCreating ? "opacity-75" : ""
        }`}
        onClick={handleCreateBet}
        disabled={isCreating || !address || (!!ensSubdomain && isSubdomainAvailable === false)}
      >
        {isCreating ? "Creating Bet..." : "Create Bet (I bet YES)"}
      </button>

      {!address && (
        <div className="mt-2 p-4 bg-warning/10 border border-warning/20 rounded-lg">
          <p className="text-center text-sm text-warning">
            🔗 Please connect your wallet to create a bet and interact with the contract
          </p>
        </div>
      )}

      {/* Last Transaction */}
      {lastTxHash && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-green-800">
            <span>Bet created! </span>
            <a
              href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              View transaction →
            </a>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="text-sm text-gray-600 mt-6 space-y-1">
        <p>• You are betting that {selectedFeed.split("/")[0]} will reach the target price</p>
        <p>• If someone joins, they bet it won't reach the target</p>
        <p>• Winner receives the ENS subdomain as a trophy</p>
      </div>
    </div>
  );
};
