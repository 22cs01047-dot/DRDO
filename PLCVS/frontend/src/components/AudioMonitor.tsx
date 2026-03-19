/**
 * AudioMonitor — real-time audio level visualization.
 *
 * CHANGE: Integrated useAudioAnalyzer for browser-side mic preview.
 * When a session is running, shows WebSocket-provided levels.
 * When idle, user can activate "Test Mic" for local preview
 * including a waveform visualization.
 */

import { useRef, useEffect, useCallback } from "react";
import { Mic, MicOff } from "lucide-react";
import type { AudioLevel } from "../types";
import { clamp } from "../utils/helpers";
import { useAudioAnalyzer } from "../hooks/useAudioAnalyzer";

interface AudioMonitorProps {
  audioLevel: AudioLevel;
  isConnected: boolean;
  selectedDeviceId?: string | null;
}

export const AudioMonitor = ({ audioLevel, isConnected, selectedDeviceId }: AudioMonitorProps) => {
  const analyzer = useAudioAnalyzer();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Determine data source: WebSocket has real data when rms > 0
  const hasWsAudio = audioLevel.rms > 0.001 || audioLevel.peak > 0.001;
  const useLocalSource = analyzer.isActive && !hasWsAudio;

  const displayRms = useLocalSource ? analyzer.rms : audioLevel.rms;
  const displayPeak = useLocalSource ? analyzer.peak : audioLevel.peak;
  const displaySpeech = useLocalSource ? analyzer.isSpeech : audioLevel.isSpeech;

  const rmsWidth = clamp(displayRms * 100, 0, 100);
  const peakWidth = clamp(displayPeak * 100, 0, 100);

  const toggleLocalMic = useCallback(() => {
    if (analyzer.isActive) {
      analyzer.stop();
    } else {
      analyzer.start(selectedDeviceId || undefined);
    }
  }, [analyzer, selectedDeviceId]);

  // Restart analyzer if selected device changes while active
  useEffect(() => {
    if (analyzer.isActive && selectedDeviceId) {
      analyzer.start(selectedDeviceId);
    }
  }, [selectedDeviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Waveform canvas drawing (runs at ~30fps via RAF, no React state)
  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyzer.analyserRef.current;
    if (!canvas || !analyser || !analyzer.isActive) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufLen = analyser.fftSize;
    const dataArr = new Float32Array(bufLen);
    let raf: number;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(dataArr);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Center line
      ctx.strokeStyle = document.documentElement.classList.contains("dark")
        ? "rgba(71,85,105,0.3)" : "rgba(203,213,225,0.5)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Waveform
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = displaySpeech ? "#10b981" : "#3b82f6";
      ctx.lineJoin = "round";

      const step = Math.max(1, Math.floor(bufLen / w));
      for (let i = 0; i < w; i++) {
        const idx = i * step;
        const v = idx < bufLen ? dataArr[idx] : 0;
        const y = (1 - v) * h / 2;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyzer.isActive, analyzer.analyserRef, displaySpeech]);

  return (
    <div aria-label="Audio input levels">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mic size={14} className="text-slate-400 dark:text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Audio Input
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {displaySpeech && (
            <span className="text-2xs px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/15
                             text-emerald-700 dark:text-emerald-400 font-medium">
              Speech
            </span>
          )}
          {/* Test Mic toggle */}
          <button
            onClick={toggleLocalMic}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-medium transition-colors ${
              analyzer.isActive
                ? "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/25"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}
            aria-label={analyzer.isActive ? "Stop microphone test" : "Test microphone"}
          >
            {analyzer.isActive ? <MicOff size={10} /> : <Mic size={10} />}
            {analyzer.isActive ? "Stop" : "Test Mic"}
          </button>
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-400 dark:bg-red-500"}`}
            aria-label={isConnected ? "Connected" : "Disconnected"}
          />
        </div>
      </div>

      {/* Error */}
      {analyzer.error && (
        <p className="text-2xs text-red-600 dark:text-red-400 mb-2 bg-red-50 dark:bg-red-500/10 p-2 rounded">
          {analyzer.error}
        </p>
      )}

      {/* Waveform canvas (visible when local analyzer active) */}
      {analyzer.isActive && (
        <div className="mb-2 rounded-md overflow-hidden bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-600/50">
          <canvas
            ref={canvasRef}
            width={300}
            height={48}
            className="w-full h-12 block"
          />
        </div>
      )}

      {/* RMS Level */}
      <div className="mb-2">
        <div className="flex justify-between text-2xs text-slate-400 dark:text-slate-500 mb-1">
          <span>Level (RMS)</span>
          <span className="tabular-nums">{(displayRms * 100).toFixed(0)}%</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-100 ${
              displaySpeech ? "bg-emerald-500" : "bg-sky-400"
            }`}
            style={{ width: `${rmsWidth}%` }}
          />
        </div>
      </div>

      {/* Peak Level */}
      <div>
        <div className="flex justify-between text-2xs text-slate-400 dark:text-slate-500 mb-1">
          <span>Peak</span>
          <span className="tabular-nums">{(displayPeak * 100).toFixed(0)}%</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1 overflow-hidden">
          <div
            className={`h-1 rounded-full transition-all duration-100 ${
              peakWidth > 90 ? "bg-red-400" : "bg-amber-400"
            }`}
            style={{ width: `${peakWidth}%` }}
          />
        </div>
      </div>

      {/* Source indicator */}
      <div className="mt-2 text-center">
        <span className="text-[9px] text-slate-400 dark:text-slate-500">
          {hasWsAudio ? "Source: Session (WebSocket)" : analyzer.isActive ? "Source: Browser Mic (Preview)" : "No audio source"}
        </span>
      </div>
    </div>
  );
};