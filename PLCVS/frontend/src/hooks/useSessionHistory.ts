/**
 * Hook for fetching past session history records.
 * Auto-refreshes when the Zustand store's lastSessionAck changes
 * (i.e. after stop / pause / resume ACKs).
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { getSessionHistory } from "../api/session";
import { useSessionStore } from "../store/sessionStore";
import type { SessionHistoryRecord } from "../api/types";

interface UseSessionHistoryReturn {
  sessions: SessionHistoryRecord[];
  isLoading: boolean;
  error: string | null;
  load: (limit?: number) => Promise<void>;
}

export function useSessionHistory(): UseSessionHistoryReturn {
  const [sessions, setSessions] = useState<SessionHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Subscribe to the store's lastSessionAck to trigger auto-refresh
  const lastSessionAck = useSessionStore((s) => s.lastSessionAck);

  const load = useCallback(async (limit = 20) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSessionHistory(limit);
      if (mountedRef.current) {
        setSessions(data.sessions);
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

  // Auto-refresh when a session lifecycle ACK fires (stop / pause / resume / start)
  const ackCountRef = useRef(0);
  useEffect(() => {
    if (!lastSessionAck) return;
    // Skip the very first render where lastSessionAck may already be set
    ackCountRef.current++;
    if (ackCountRef.current <= 1) return;
    // Small delay so the backend has time to persist the session record
    const timer = setTimeout(() => {
      load(20);
    }, 500);
    return () => clearTimeout(timer);
  }, [lastSessionAck, load]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { sessions, isLoading, error, load };
}
