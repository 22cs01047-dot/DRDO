/**
 * ApiTestDashboard — developer tool for exercising all backend endpoints.
 * Access: Ctrl+Shift+D. Phase 3: Full dark mode treatment.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Play, Loader2, CheckCircle2, XCircle, Upload, Minus } from "lucide-react";
import { useHealth } from "../hooks/useHealth";
import { useChecklist } from "../hooks/useChecklist";
import { useSessionHistory } from "../hooks/useSessionHistory";
import { useAudioDevices } from "../hooks/useAudioDevices";
import { useTranscribeFile } from "../hooks/useTranscribeFile";
import {
  startSession, stopSession, pauseSession, resumeSession,
  getSessionProgress, getSessionState, getSessionAlerts, manualOverride,
} from "../api/session";

interface EndpointResult {
  status: "idle" | "loading" | "success" | "error";
  data?: unknown; error?: string; latencyMs?: number;
}

interface ApiTestDashboardProps { onClose: () => void; }

export const ApiTestDashboard = ({ onClose }: ApiTestDashboardProps) => {
  const health = useHealth(0);
  const checklist = useChecklist();
  const history = useSessionHistory();
  const audioDevices = useAudioDevices();
  const transcriber = useTranscribeFile();

  const [sessionStart, setSessionStart] = useState<EndpointResult>({ status: "idle" });
  const [sessionStop, setSessionStop] = useState<EndpointResult>({ status: "idle" });
  const [sessionPause, setSessionPause] = useState<EndpointResult>({ status: "idle" });
  const [sessionResume, setSessionResume] = useState<EndpointResult>({ status: "idle" });
  const [sessionProgress, setSessionProgress] = useState<EndpointResult>({ status: "idle" });
  const [sessionState, setSessionState] = useState<EndpointResult>({ status: "idle" });
  const [sessionAlerts, setSessionAlerts] = useState<EndpointResult>({ status: "idle" });
  const [overrideResult, setOverrideResult] = useState<EndpointResult>({ status: "idle" });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const execute = useCallback(
    async <T,>(setter: React.Dispatch<React.SetStateAction<EndpointResult>>, fn: () => Promise<T>) => {
      setter({ status: "loading" });
      const start = performance.now();
      try {
        const data = await fn();
        setter({ status: "success", data, latencyMs: Math.round(performance.now() - start) });
      } catch (err) {
        setter({ status: "error", error: err instanceof Error ? err.message : String(err), latencyMs: Math.round(performance.now() - start) });
      }
    }, []
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) transcriber.transcribe(file); },
    [transcriber]
  );

  const endpoints: {
    method: "GET" | "POST"; path: string; desc: string;
    status: EndpointResult["status"]; data?: unknown; error?: string | null;
    latencyMs?: number; onExecute: () => void;
  }[] = [
    { method: "GET", path: "/health", desc: "System health & model status",
      status: health.isLoading ? "loading" : health.error ? "error" : health.health ? "success" : "idle",
      data: health.health, error: health.error, onExecute: health.refresh },
    { method: "GET", path: "/checklist/config", desc: "Mission checklist configuration",
      status: checklist.isLoadingConfig ? "loading" : checklist.configError ? "error" : checklist.config ? "success" : "idle",
      data: checklist.config, error: checklist.configError, onExecute: checklist.loadConfig },
    { method: "GET", path: "/checklist/snapshot", desc: "Live checklist state",
      status: checklist.isLoadingSnapshot ? "loading" : checklist.snapshotError ? "error" : checklist.snapshot ? "success" : "idle",
      data: checklist.snapshot, error: checklist.snapshotError, onExecute: checklist.loadSnapshot },
    { method: "POST", path: "/session/start", desc: "Start verification session",
      ...sessionStart, onExecute: () => execute(setSessionStart, () => startSession({})) },
    { method: "POST", path: "/session/stop", desc: "Stop active session",
      ...sessionStop, onExecute: () => execute(setSessionStop, () => stopSession()) },
    { method: "POST", path: "/session/pause", desc: "Pause active session",
      ...sessionPause, onExecute: () => execute(setSessionPause, () => pauseSession()) },
    { method: "POST", path: "/session/resume", desc: "Resume paused session",
      ...sessionResume, onExecute: () => execute(setSessionResume, () => resumeSession()) },
    { method: "GET", path: "/session/progress", desc: "Current progress metrics",
      ...sessionProgress, onExecute: () => execute(setSessionProgress, () => getSessionProgress()) },
    { method: "GET", path: "/session/state", desc: "Complete session state",
      ...sessionState, onExecute: () => execute(setSessionState, () => getSessionState()) },
    { method: "GET", path: "/session/alerts", desc: "Session alerts",
      ...sessionAlerts, onExecute: () => execute(setSessionAlerts, () => getSessionAlerts({ limit: 10 })) },
    { method: "POST", path: "/session/override", desc: "Override checklist item",
      ...overrideResult, onExecute: () => execute(setOverrideResult, () => manualOverride({ item_id: "CI_001", status: "CONFIRMED" })) },
    { method: "GET", path: "/devices", desc: "Audio input devices",
      status: audioDevices.isLoading ? "loading" : audioDevices.error ? "error" : audioDevices.devices.length > 0 ? "success" : "idle",
      data: audioDevices.devices.length > 0 ? { devices: audioDevices.devices } : undefined,
      error: audioDevices.error, onExecute: audioDevices.load },
    { method: "GET", path: "/sessions/history", desc: "Past session records",
      status: history.isLoading ? "loading" : history.error ? "error" : history.sessions.length > 0 ? "success" : "idle",
      data: history.sessions.length > 0 ? { sessions: history.sessions } : undefined,
      error: history.error, onExecute: () => history.load(10) },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      role="dialog" aria-modal="true" aria-labelledby="api-dash-title">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl dark:shadow-slate-900/50
                      max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col
                      border border-slate-200 dark:border-slate-700">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700
                        bg-slate-50/50 dark:bg-slate-800/80 flex-shrink-0">
          <div>
            <h2 id="api-dash-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">API Test Dashboard</h2>
            <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">Exercise all REST endpoints · Ctrl+Shift+D to toggle</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors" aria-label="Close dashboard">
            <X size={18} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Endpoint list */}
        <div className="flex-1 overflow-y-auto scrollbar-on-hover p-6 space-y-3">
          {endpoints.map((ep) => <EndpointCard key={ep.path + ep.method} {...ep} />)}

          {/* File upload */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-md p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MethodBadge method="POST" />
                <div>
                  <code className="text-sm font-mono text-slate-800 dark:text-slate-200">/transcribe/file</code>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">Upload & transcribe audio file</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={transcriber.isLoading ? "loading" : transcriber.error ? "error" : transcriber.result ? "success" : "idle"} />
                <input ref={fileInputRef} type="file" accept=".wav,.mp3,.ogg,.flac" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900
                             rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors">
                  <Upload size={12} /> Upload
                </button>
              </div>
            </div>
            {transcriber.result && <ResultPreview data={transcriber.result} />}
            {transcriber.error && <p className="mt-2 text-2xs text-red-600 dark:text-red-400">{transcriber.error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────

interface EndpointCardProps {
  method: "GET" | "POST"; path: string; desc: string;
  status: EndpointResult["status"]; data?: unknown; error?: string | null;
  latencyMs?: number; onExecute: () => void;
}

const EndpointCard = ({ method, path, desc, status, data, error, latencyMs, onExecute }: EndpointCardProps) => (
  <div className="border border-slate-200 dark:border-slate-700 rounded-md p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <MethodBadge method={method} />
        <div>
          <code className="text-sm font-mono text-slate-800 dark:text-slate-200">{path}</code>
          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={status} latencyMs={latencyMs} />
        <button onClick={onExecute} disabled={status === "loading"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900
                     rounded-md hover:bg-slate-800 dark:hover:bg-slate-200
                     disabled:bg-slate-300 dark:disabled:bg-slate-600 dark:disabled:text-slate-400
                     transition-colors">
          {status === "loading" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Execute
        </button>
      </div>
    </div>
    {status === "success" && data != null && <ResultPreview data={data} />}
    {status === "error" && error != null && <p className="mt-2 text-2xs text-red-600 dark:text-red-400">{error}</p>}
  </div>
);

const MethodBadge = ({ method }: { method: string }) => {
  const cls = method === "GET"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30"
    : "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30";
  return <span className={`text-2xs font-bold px-2 py-1 rounded border ${cls}`}>{method}</span>;
};

const StatusBadge = ({ status, latencyMs }: { status: EndpointResult["status"]; latencyMs?: number }) => {
  const config: Record<string, { icon: React.ReactNode; cls: string }> = {
    idle:    { icon: <Minus size={11} />,                              cls: "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-700 dark:text-slate-500 dark:border-slate-600" },
    loading: { icon: <Loader2 size={11} className="animate-spin" />,   cls: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30" },
    success: { icon: <CheckCircle2 size={11} />,                        cls: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30" },
    error:   { icon: <XCircle size={11} />,                             cls: "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 text-2xs px-2 py-1 rounded border ${c.cls}`}>
      {c.icon}
      {latencyMs !== undefined && status !== "idle" && (
        <span className="text-slate-400 dark:text-slate-500 tabular-nums">{latencyMs}ms</span>
      )}
    </span>
  );
};

const ResultPreview = ({ data }: { data: unknown }) => {
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(data, null, 2);
  const preview = json.length > 200 ? json.slice(0, 200) + "…" : json;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xs text-slate-400 dark:text-slate-500 font-medium">Response</span>
        {json.length > 200 && (
          <button onClick={() => setExpanded(!expanded)}
            className="text-2xs text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 transition-colors">
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      <pre className="text-2xs bg-slate-50 dark:bg-slate-900 rounded-md p-3 overflow-x-auto max-h-52 overflow-y-auto
                      border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300
                      font-mono leading-relaxed">
        {expanded ? json : preview}
      </pre>
    </div>
  );
};