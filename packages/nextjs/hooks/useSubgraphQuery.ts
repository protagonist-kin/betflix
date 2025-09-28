"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/121821/betflix/version/latest";

interface QueryOptions {
  variables?: Record<string, any>;
  pollInterval?: number;
  skip?: boolean;
}

// Simple in-memory cache to reduce requests
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60000; // 60 seconds cache to prevent repeated requests

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

    try {
      setLoading(true);
      const response = await axios.post(
        SUBGRAPH_URL,
        {
          query,
          variables: options.variables || {},
        },
        {
          headers: {
            "Content-Type": "application/json",
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
      // Handle rate limit errors with exponential backoff
      if (err.response?.status === 429) {
        const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
        console.warn(`Rate limited. Retrying in ${backoffTime / 1000}s...`);

        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }

        retryTimeoutRef.current = setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchData();
        }, backoffTime);
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
