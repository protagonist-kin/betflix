"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

// The Graph Gateway URL with subgraph ID
const SUBGRAPH_URL = `https://gateway.thegraph.com/api/subgraphs/id/9Wfi2JmF3LFwbaEgmvZad3vyCr45C684oyA1aRmV3mYY`;

// Get API key from environment variable
const API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY || "";

interface QueryOptions {
  variables?: Record<string, any>;
  pollInterval?: number;
  skip?: boolean;
}

// Simple in-memory cache to reduce requests
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 300000; // 5 minutes cache to prevent repeated requests

// Global rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // Minimum 2 seconds between any API requests

export function useSubgraphQuery<T = any>(query: string, options: QueryOptions = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!options.skip);
  const [error, setError] = useState<Error | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Create a cache key from query and variables
  const cacheKey = JSON.stringify({ query, variables: options.variables });

  const fetchData = useCallback(async () => {
    if (options.skip) return;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    // Rate limiting - wait if request is too soon
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastRequestTime = Date.now();

    try {
      setLoading(true);
      const response = await axios.post(
        SUBGRAPH_URL,
        {
          query,
          variables: options.variables || {},
          operationName: "Subgraphs",
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
          },
          timeout: 10000, // 10 second timeout
        },
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Update cache
      cache.set(cacheKey, { data: response.data.data, timestamp: Date.now() });

      setData(response.data.data);
      setError(null);
      setRetryCount(0); // Reset retry count on success
    } catch (err: any) {
      // Handle rate limit errors defensively - return empty data
      if (err.response?.status === 429) {
        console.warn("Rate limited by subgraph. Returning cached data or empty result.");
        // Return empty structure that matches expected data shape
        const emptyData =
          query.includes("pendingBets") && query.includes("matchedBets")
            ? { pendingBets: [], matchedBets: [] }
            : query.includes("globalStats")
              ? { globalStats: null }
              : query.includes("user(")
                ? { user: null }
                : { bets: [] };
        setData(emptyData as T);
        setError(null); // Don't show error to user
      } else {
        setError(err as Error);
        console.error("Subgraph query error:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [query, options.variables, options.skip, cacheKey, retryCount]);

  useEffect(() => {
    fetchData();

    // Set up polling if requested
    let interval: NodeJS.Timeout | null = null;
    if (options.pollInterval && !options.skip) {
      interval = setInterval(fetchData, options.pollInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [fetchData, options.pollInterval, options.skip]);

  return { data, loading, error, refetch: fetchData };
}
