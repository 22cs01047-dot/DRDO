
import { useState, useCallback, useRef, useEffect } from "react";
import { transcribeFile } from "../api/audio";
import type { TranscribeFileResponse } from "../api/types";

export function useTranscribeFile() {
  const [result, setResult] = useState<TranscribeFileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // FIX: cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const transcribe = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await transcribeFile(file);
      if (mountedRef.current) setResult(data);
      return data;
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => { setResult(null); setError(null); }, []);

  return { result, isLoading, error, transcribe, clear };
}
