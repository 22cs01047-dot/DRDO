/**
 * Hook for local audio playback of recorded segments.
 */

import { useState, useRef, useCallback } from "react";
import { API_BASE_URL } from "../utils/constants";

interface UseAudioReturn {
  isPlaying: boolean;
  currentFile: string | null;
  play: (audioFile: string) => void;
  stop: () => void;
  error: string | null;
}

export function useAudio(): UseAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentFile(null);
  }, []);

  const play = useCallback(
    (audioFile: string) => {
      stop();
      setError(null);

      try {
        const url = `${API_BASE_URL}/audio/${encodeURIComponent(audioFile)}`;
        const audio = new Audio(url);

        audio.onplay = () => {
          setIsPlaying(true);
          setCurrentFile(audioFile);
        };
        audio.onended = () => {
          setIsPlaying(false);
          setCurrentFile(null);
        };
        audio.onerror = () => {
          setError(`Failed to play: ${audioFile}`);
          setIsPlaying(false);
          setCurrentFile(null);
        };

        audioRef.current = audio;
        audio.play().catch((e) => {
          setError(String(e));
          setIsPlaying(false);
        });
      } catch (e) {
        setError(String(e));
      }
    },
    [stop]
  );

  return { isPlaying, currentFile, play, stop, error };
}
