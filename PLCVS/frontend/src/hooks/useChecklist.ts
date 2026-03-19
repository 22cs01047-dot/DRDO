
import { useState, useCallback, useRef, useEffect } from "react";
import { getChecklistConfig, getChecklistSnapshot } from "../api/checklist";
import type { ChecklistConfigResponse, ChecklistSnapshotResponse } from "../api/types";

export function useChecklist() {
  const [config, setConfig] = useState<ChecklistConfigResponse | null>(null);
  const [snapshot, setSnapshot] = useState<ChecklistSnapshotResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // FIX: cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    setConfigError(null);
    try {
      const data = await getChecklistConfig();
      if (mountedRef.current) setConfig(data);
      return data;
    } catch (err) {
      if (mountedRef.current) setConfigError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (mountedRef.current) setIsLoadingConfig(false);
    }
  }, []);

  const loadSnapshot = useCallback(async () => {
    setIsLoadingSnapshot(true);
    setSnapshotError(null);
    try {
      const data = await getChecklistSnapshot();
      if (mountedRef.current) setSnapshot(data);
      return data;
    } catch (err) {
      if (mountedRef.current) setSnapshotError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (mountedRef.current) setIsLoadingSnapshot(false);
    }
  }, []);

  return {
    config, snapshot, isLoadingConfig, isLoadingSnapshot,
    configError, snapshotError, loadConfig, loadSnapshot,
  };
}