import type { ItemStatus, AlertSeverity, StageData, ChecklistItemData } from "../types";
import { CONFIDENCE_THRESHOLDS } from "./constants";

// ─── Time Formatting ───────────────────────────────────────────

export function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function calculateDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diffMs = e - s;
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

// ─── Confidence ────────────────────────────────────────────────

/**
 * CHANGE: Added dark: variants so confidence badges are legible
 * on dark backgrounds.
 */
export function confidenceBadgeClass(confidence: number): string {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH)
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400";
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM)
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400";
  return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400";
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return "High";
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return "Medium";
  return "Low";
}

// ─── Progress ──────────────────────────────────────────────────

export function computeStageProgress(items: ChecklistItemData[]): number {
  if (items.length === 0) return 0;
  const confirmed = items.filter((i) => i.status === "CONFIRMED").length;
  return Math.round((confirmed / items.length) * 100);
}

export function computeOverallProgress(stages: StageData[]): number {
  let total = 0;
  let confirmed = 0;
  for (const stage of stages) {
    total += stage.items.length;
    confirmed += stage.items.filter((i) => i.status === "CONFIRMED").length;
  }
  return total === 0 ? 0 : Math.round((confirmed / total) * 100);
}

export function deriveStageStatus(items: ChecklistItemData[]): ItemStatus {
  if (items.length === 0) return "PENDING";
  if (items.every((i) => i.status === "CONFIRMED")) return "CONFIRMED";
  if (items.some((i) => i.status === "FAILED")) return "FAILED";
  if (items.some((i) => ["IN_PROGRESS", "CONFIRMED", "AMBIGUOUS"].includes(i.status)))
    return "IN_PROGRESS";
  return "PENDING";
}

// ─── General ───────────────────────────────────────────────────

export function generateId(prefix = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

export function sortAlerts(
  alerts: { severity: AlertSeverity; timestamp: string }[]
): typeof alerts {
  const order: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return [...alerts].sort((a, b) => {
    const diff = order[a.severity] - order[b.severity];
    return diff !== 0 ? diff : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

// ─── Audio Alert (Singleton AudioContext) ──────────────────────

let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
  } catch {
    return null;
  }
}

export function playAlertBeep(severity: AlertSeverity): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const freq = severity === "CRITICAL" ? 880 : severity === "WARNING" ? 660 : 440;
  const duration = severity === "CRITICAL" ? 0.4 : 0.25;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.type = "sine";
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);

  if (severity === "CRITICAL") {
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.5);
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.5);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc2.start(ctx.currentTime + 0.5);
    osc2.stop(ctx.currentTime + 0.9);
  }
}