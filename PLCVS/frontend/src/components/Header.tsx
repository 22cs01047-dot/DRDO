import {
  Rocket, Play, Pause, Square, RotateCcw, Wifi, WifiOff,
  Clock, Shield, BookOpen, History,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import type { SessionInfo, SessionStatus } from "../types";
import type { SessionAckEvent, SessionAckType } from "../store/sessionStore";
import { calculateDuration } from "../utils/helpers";

interface HeaderProps {
  session: SessionInfo;
  isConnected: boolean;
  systemReady: boolean;
  lastSessionAck: SessionAckEvent | null;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onOpenConfig?: () => void;
  onOpenHistory?: () => void;
}

const statusConfig: Record<SessionStatus, { label: string; className: string }> = {
  IDLE:      { label: "Idle",      className: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  RUNNING:   { label: "Live",      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400" },
  PAUSED:    { label: "Paused",    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400" },
  COMPLETED: { label: "Completed", className: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400" },
  ABORTED:   { label: "Aborted",   className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400" },
};

const headerBorder: Record<string, string> = {
  IDLE:      "border-slate-200 dark:border-slate-700",
  RUNNING:   "border-emerald-400 dark:border-emerald-500/60",
  PAUSED:    "border-amber-400 dark:border-amber-500/60",
  COMPLETED: "border-emerald-500 dark:border-emerald-400/60",
  ABORTED:   "border-red-400 dark:border-red-500/60",
};

const ackLabels: Record<SessionAckType, string> = {
  STARTED: "Started", STOPPED: "Stopped", PAUSED: "Paused", RESUMED: "Resumed",
};

export const Header = ({
  session, isConnected, systemReady, lastSessionAck,
  onStart, onStop, onPause, onResume, onReset,
  onOpenConfig, onOpenHistory,
}: HeaderProps) => {
  const badge = statusConfig[session.status];
  const border = headerBorder[session.status] || "border-slate-200 dark:border-slate-700";

  return (
    <header className={`bg-white dark:bg-slate-800 border-b-2 ${border} transition-colors h-full`} role="banner">
      <div className="px-3 md:px-6 h-14 flex items-center justify-between gap-2 md:gap-4">

        {/* ── Left: Logo + Mission ───────────────────── */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <div className="flex items-center gap-2 md:gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-md bg-slate-900 dark:bg-slate-600 flex items-center justify-center">
              <Rocket size={15} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight leading-none">PLCVS</h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-none mt-0.5 hidden sm:block">Pre-Launch Verification</p>
            </div>
          </div>
          {session.missionName && (
            <>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-600 flex-shrink-0 hidden md:block" />
              <div className="min-w-0 hidden md:block">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider leading-none">Mission</p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate leading-snug max-w-[180px] lg:max-w-none">{session.missionName}</p>
              </div>
            </>
          )}
        </div>

        {/* ── Center: Status indicators ──────────────── */}
        <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-md text-xs font-medium ${badge.className}`}>
            {session.status === "RUNNING" && (
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
            {session.status === "PAUSED" && <Pause size={10} className="text-amber-600 dark:text-amber-400" />}
            <span className="hidden sm:inline">{badge.label}</span>
            <span className="sm:hidden">{badge.label.slice(0, 3)}</span>
          </span>

          <span className={`inline-flex items-center gap-1 px-1.5 md:px-2 py-1 rounded-md text-xs font-medium ${
            isConnected ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
          }`} role="status" aria-label={isConnected ? "Connected" : "Disconnected"}>
            {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span className="hidden md:inline">{isConnected ? "Online" : "Offline"}</span>
          </span>

          <span className={`hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
            systemReady ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
          }`} aria-label={systemReady ? "Models ready" : "Models loading"}>
            <Shield size={12} />{systemReady ? "Ready" : "Loading"}
          </span>

          {session.startTime && (
            <span className="hidden lg:inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <Clock size={12} />{calculateDuration(session.startTime, session.endTime)}
            </span>
          )}
          {lastSessionAck && (
            <span className="hidden lg:inline text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              ACK: {ackLabels[lastSessionAck.type]}
            </span>
          )}
        </div>

        {/* ── Right: Actions + Drawers + Theme ───────── */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
          {/* Session controls (unchanged from Phase 4) */}
          {session.status === "IDLE" && (
            <button onClick={onStart} disabled={!isConnected || !systemReady}
              className="inline-flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md bg-slate-900 dark:bg-slate-100
                         text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-200
                         disabled:bg-slate-300 dark:disabled:bg-slate-600 dark:disabled:text-slate-400
                         disabled:cursor-not-allowed transition-colors min-h-[36px]"
              aria-label="Start session">
              <Play size={14} /><span className="hidden sm:inline">Start Session</span><span className="sm:hidden">Start</span>
            </button>
          )}
          {session.status === "RUNNING" && (<>
            <button onClick={onPause}
              className="inline-flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600
                         text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors min-h-[36px]"
              aria-label="Pause session"><Pause size={14} /><span className="hidden sm:inline">Pause</span></button>
            <button onClick={onStop}
              className="inline-flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-md bg-red-600 dark:bg-red-500
                         text-white text-sm font-medium hover:bg-red-700 dark:hover:bg-red-600 transition-colors min-h-[36px]"
              aria-label="Stop session"><Square size={14} /><span className="hidden sm:inline">Stop</span></button>
          </>)}
          {session.status === "PAUSED" && (<>
            <button onClick={onResume}
              className="inline-flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-md bg-slate-900 dark:bg-slate-100
                         text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors min-h-[36px]"
              aria-label="Resume session"><Play size={14} /><span className="hidden sm:inline">Resume</span></button>
            <button onClick={onStop}
              className="inline-flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-md bg-red-600 dark:bg-red-500
                         text-white text-sm font-medium hover:bg-red-700 dark:hover:bg-red-600 transition-colors min-h-[36px]"
              aria-label="Stop session"><Square size={14} /><span className="hidden sm:inline">Stop</span></button>
          </>)}
          {(session.status === "COMPLETED" || session.status === "ABORTED") && (
            <button onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md border border-slate-200 dark:border-slate-600
                         text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors min-h-[36px]"
              aria-label="New session"><RotateCcw size={14} /><span className="hidden sm:inline">New Session</span><span className="sm:hidden">Reset</span></button>
          )}

          {/* ── Divider + Utility buttons ─────────── */}
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-600 mx-0.5 hidden sm:block" />

          {/* CHANGE: Config drawer button */}
          {onOpenConfig && (
            <button
              onClick={onOpenConfig}
              className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors
                         bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600
                         text-slate-600 dark:text-slate-300"
              aria-label="View mission configuration"
              title="Mission Config"
            >
              <BookOpen size={15} />
            </button>
          )}

          {/* CHANGE: History drawer button */}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors
                         bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600
                         text-slate-600 dark:text-slate-300"
              aria-label="View session history"
              title="Session History"
            >
              <History size={15} />
            </button>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};