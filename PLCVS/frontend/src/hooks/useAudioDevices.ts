
import { useState, useCallback, useRef, useEffect } from "react";
import { getAudioDevices } from "../api/audio";
import type { AudioDeviceDTO } from "../api/types";

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDeviceDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // FIX: cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAudioDevices();
      if (mountedRef.current) setDevices(data.devices);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  return { devices, isLoading, error, load };
}