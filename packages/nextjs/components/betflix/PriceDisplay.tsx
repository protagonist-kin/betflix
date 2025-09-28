"use client";

import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/solid";

// Price feed IDs
const PRICE_FEEDS = {
  "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
};

interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
}

export const PriceDisplay = () => {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrices = async () => {
    try {
      const pricePromises = Object.entries(PRICE_FEEDS).map(async ([symbol, feedId]) => {
        try {
          const response = await fetch("/api/pyth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priceId: feedId }),
          });

          if (!response.ok) {
            console.warn(`Failed to fetch ${symbol} price:`, response.statusText);
            return {
              symbol,
              price: 0,
              change24h: 0,
            };
          }

          const data = await response.json();
          return {
            symbol,
            price: data.price || 0,
            change24h: Math.random() * 10 - 5, // Mock 24h change for now
          };
        } catch (error) {
          console.warn(`Error fetching ${symbol} price:`, error);
          return {
            symbol,
            price: 0,
            change24h: 0,
          };
        }
      });

      const priceData = await Promise.all(pricePromises);
      setPrices(priceData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching prices:", error);
      // Set fallback data to prevent empty UI
      setPrices([
        { symbol: "ETH/USD", price: 0, change24h: 0 },
        { symbol: "BTC/USD", price: 0, change24h: 0 },
      ]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex gap-4">
        <div className="skeleton h-16 w-48"></div>
        <div className="skeleton h-16 w-48"></div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 flex-wrap justify-center">
      {prices.map(priceData => (
        <div key={priceData.symbol} className="bg-base-100 border border-base-300 rounded-lg p-4 min-w-[200px]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base-content">{priceData.symbol}</h3>
              <p className="text-2xl font-mono text-base-content mt-1">
                {priceData.price > 0 ? `$${priceData.price.toFixed(2)}` : "Unavailable"}
              </p>
            </div>
            {priceData.price > 0 && (
              <div className={`flex items-center ${priceData.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                {priceData.change24h >= 0 ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                <span className="text-sm ml-1 font-medium">{Math.abs(priceData.change24h).toFixed(2)}%</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
