import { useState, useCallback } from "react";
import { notification } from "~~/utils/scaffold-eth";

// Pyth price feed IDs
export const PRICE_FEEDS = {
  "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "SOL/USD": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
} as const;

export type PriceFeedId = keyof typeof PRICE_FEEDS;

interface PythPriceData {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

interface HermesResponse {
  binary: {
    data: string[];
  };
  parsed: PythPriceData[];
}

/**
 * Hook to fetch Pyth price updates from Hermes
 */
export const usePythPrice = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  /**
   * Fetch price update data from Pyth Hermes API
   * This data needs to be passed to the smart contract's updatePriceFeeds function
   */
  const fetchPriceUpdateData = useCallback(async (priceFeedId: PriceFeedId = "ETH/USD") => {
    setIsLoading(true);
    try {
      const feedId = PRICE_FEEDS[priceFeedId];
      
      // Fetch from Pyth Hermes API
      const response = await fetch(
        `https://hermes.pyth.network/api/latest_price_feeds?ids[]=${feedId}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch price data");
      }
      
      const data: HermesResponse = await response.json();
      
      // Extract the binary data needed for on-chain update
      const updateData = data.binary.data;
      
      // Also extract the current price for display
      if (data.parsed && data.parsed.length > 0) {
        const priceData = data.parsed[0];
        const price = parseInt(priceData.price.price);
        const expo = priceData.price.expo;
        const formattedPrice = price * Math.pow(10, expo);
        setCurrentPrice(formattedPrice);
      }
      
      return updateData;
    } catch (error) {
      console.error("Error fetching Pyth price:", error);
      notification.error("Failed to fetch price data");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get a formatted price string
   */
  const getFormattedPrice = useCallback((price: number, expo: number = -8) => {
    const actualPrice = price * Math.pow(10, expo);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(actualPrice);
  }, []);

  return {
    fetchPriceUpdateData,
    getFormattedPrice,
    currentPrice,
    isLoading,
    PRICE_FEEDS,
  };
};
