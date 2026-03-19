/**
 * Application-wide constants — design tokens & configuration.
 *
 * CHANGE: Added dark: class variants to STATUS_COLORS and SEVERITY_COLORS.
 * This automatically propagates dark mode to all components that consume
 * these tokens (ChecklistItemRow, StageDetailPanel, AlertPanel, SessionReport, etc.)
 */

// ─── Network ───────────────────────────────────────────────────

export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8765/ws";
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8765/api/v1";

export const WS_RECONNECT_INTERVAL = 3000;
export const WS_MAX_RECONNECT_ATTEMPTS = 20;
export const WS_PING_INTERVAL = 15000;

// ─── Status Design Tokens (with dark mode) ─────────────────────

export const STATUS_COLORS = {
  PENDING: {
    bg:       "bg-slate-50 dark:bg-slate-700/30",
    border:   "border-slate-200 dark:border-slate-600",
    text:     "text-slate-500 dark:text-slate-400",
    dot:      "bg-slate-400",
    barColor: "bg-slate-300 dark:bg-slate-600",
  },
  IN_PROGRESS: {
    bg:       "bg-sky-50/60 dark:bg-sky-500/10",
    border:   "border-sky-200 dark:border-sky-500/30",
    text:     "text-sky-700 dark:text-sky-400",
    dot:      "bg-sky-500",
    barColor: "bg-sky-500",
  },
  CONFIRMED: {
    bg:       "bg-emerald-50/60 dark:bg-emerald-500/10",
    border:   "border-emerald-200 dark:border-emerald-500/30",
    text:     "text-emerald-700 dark:text-emerald-400",
    dot:      "bg-emerald-500",
    barColor: "bg-emerald-500",
  },
  FAILED: {
    bg:       "bg-red-50/60 dark:bg-red-500/10",
    border:   "border-red-200 dark:border-red-500/30",
    text:     "text-red-700 dark:text-red-400",
    dot:      "bg-red-500",
    barColor: "bg-red-500",
  },
  AMBIGUOUS: {
    bg:       "bg-amber-50/60 dark:bg-amber-500/10",
    border:   "border-amber-200 dark:border-amber-500/30",
    text:     "text-amber-700 dark:text-amber-400",
    dot:      "bg-amber-500",
    barColor: "bg-amber-500",
  },
} as const;

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  CONFIRMED: "Confirmed",
  FAILED: "Failed",
  AMBIGUOUS: "Ambiguous",
};

export const SEVERITY_COLORS = {
  INFO: {
    bg:     "bg-sky-50/60 dark:bg-sky-500/10",
    border: "border-sky-200 dark:border-sky-500/30",
    text:   "text-sky-800 dark:text-sky-400",
    dot:    "bg-sky-500",
  },
  WARNING: {
    bg:     "bg-amber-50/60 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
    text:   "text-amber-800 dark:text-amber-400",
    dot:    "bg-amber-500",
  },
  CRITICAL: {
    bg:     "bg-red-50/60 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/30",
    text:   "text-red-800 dark:text-red-400",
    dot:    "bg-red-500",
  },
} as const;

export const DEPENDENCY_TYPE_LABELS: Record<string, string> = {
  STRICT: "Sequential",
  SOFT: "Recommended",
  PARALLEL: "Parallel",
  INDEPENDENT: "Independent",
};

// ─── Thresholds ────────────────────────────────────────────────

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.6,
  LOW: 0.4,
} as const;

// ─── Limits ────────────────────────────────────────────────────

export const AUDIO_SAMPLE_RATE = 16000;
export const MAX_TRANSCRIPT_HISTORY = 200;
export const MAX_ALERT_HISTORY = 100;