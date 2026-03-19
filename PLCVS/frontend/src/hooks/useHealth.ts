/**
 * Hook for polling the backend health endpoint.
 * Provides system readiness and model loading status.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getHealth } from "../api/health";
import type { HealthResponse } from "../api/types";

interface UseHealthReturn {
  health: HealthResponse | null;
  isLoading: boolean;
  error: string | null;
  isSystemReady: boolean;
  refresh: () => Promise<void>;
}

export function useHealth(pollIntervalMs = 30000): UseHealthReturn {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getHealth();
      if (mountedRef.current) {
        setHealth(data);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Initial fetch + optional polling (0 = no polling, just fetch once)
  useEffect(() => {
    mountedRef.current = true;
    refresh();

    let interval: ReturnType<typeof setInterval> | null = null;
    if (pollIntervalMs > 0) {
      interval = setInterval(refresh, pollIntervalMs);
    }
    return () => {
      mountedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [refresh, pollIntervalMs]);

  const isSystemReady =
    health !== null &&
    health.status === "healthy" &&
    health.models_loaded.stt &&
    health.models_loaded.semantic;

  return { health, isLoading, error, isSystemReady, refresh };
}
