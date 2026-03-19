/**
 * useAudioAnalyzer — Web Audio API hook for real-time microphone visualization.
 * Provides RMS, peak, speech detection, and an AnalyserNode ref for waveform drawing.
 */

import { useState, useRef, useCallback, useEffect } from "react";

interface AudioAnalyzerState {
  rms: number;
  peak: number;
  isSpeech: boolean;
  isActive: boolean;
  error: string | null;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  start: (deviceId?: string) => Promise<void>;
  stop: () => void;
}

const SPEECH_THRESHOLD = 0.015;
const UPDATE_INTERVAL_MS = 80; // ~12fps for state updates

export function useAudioAnalyzer(): AudioAnalyzerState {
  const [rms, setRms] = useState(0);
  const [peak, setPeak] = useState(0);
  const [isSpeech, setIsSpeech] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (contextRef.current && contextRef.current.state !== "closed") {
      contextRef.current.close().catch(() => {});
      contextRef.current = null;
    }
    analyserRef.current = null;
    setIsActive(false);
    setRms(0);
    setPeak(0);
    setIsSpeech(false);
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    stop(); // clean up any previous session
    setError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia not supported in this browser");
      }

      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false }
          : { echoCancellation: false, noiseSuppression: false },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      contextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      analyserRef.current = analyser;
      setIsActive(true);

      // Analysis loop — updates React state at throttled rate
      const dataArray = new Float32Array(analyser.fftSize);

      const tick = () => {
        if (!analyserRef.current) return;
        rafRef.current = requestAnimationFrame(tick);

        const now = performance.now();
        if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) return;
        lastUpdateRef.current = now;

        analyserRef.current.getFloatTimeDomainData(dataArray);

        let sumSq = 0;
        let maxAbs = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i];
          sumSq += v * v;
          const abs = Math.abs(v);
          if (abs > maxAbs) maxAbs = abs;
        }

        const rmsVal = Math.sqrt(sumSq / dataArray.length);
        setRms(Math.min(rmsVal * 3, 1)); // scale up for visibility
        setPeak(Math.min(maxAbs * 2.5, 1));
        setIsSpeech(rmsVal > SPEECH_THRESHOLD);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setIsActive(false);
    }
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => stop, [stop]);

  return { rms, peak, isSpeech, isActive, error, analyserRef, start, stop };
}