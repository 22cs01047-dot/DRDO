/**
 * StatusIcon — consistent Lucide-based status indicators.
 *
 * CHANGE: Added dark: variants to color map so icons remain
 * legible against dark backgrounds without losing saturation.
 */

import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ShieldAlert,
} from "lucide-react";
import type { ItemStatus, AlertSeverity } from "../types";

// ─── Item / Stage Status ───────────────────────────────────────

const statusIconMap: Record<ItemStatus, typeof Circle> = {
  PENDING: Circle,
  IN_PROGRESS: Loader2,
  CONFIRMED: CheckCircle2,
  FAILED: XCircle,
  AMBIGUOUS: AlertTriangle,
};

const statusColorMap: Record<ItemStatus, string> = {
  PENDING:     "text-slate-400 dark:text-slate-500",
  IN_PROGRESS: "text-sky-500 dark:text-sky-400",
  CONFIRMED:   "text-emerald-600 dark:text-emerald-400",
  FAILED:      "text-red-500 dark:text-red-400",
  AMBIGUOUS:   "text-amber-500 dark:text-amber-400",
};

interface StatusIconProps {
  status: ItemStatus | string;
  size?: number;
  className?: string;
}

export const StatusIcon = ({ status, size = 16, className = "" }: StatusIconProps) => {
  const Icon = statusIconMap[status as ItemStatus] || Circle;
  const color = statusColorMap[status as ItemStatus] || "text-slate-400 dark:text-slate-500";
  const spin = status === "IN_PROGRESS" ? "animate-spin-slow" : "";
  return <Icon size={size} className={`${color} ${spin} ${className}`.trim()} />;
};

// ─── Alert Severity ────────────────────────────────────────────

const severityIconMap: Record<AlertSeverity, typeof Info> = {
  INFO: Info,
  WARNING: AlertTriangle,
  CRITICAL: ShieldAlert,
};

const severityColorMap: Record<AlertSeverity, string> = {
  INFO:     "text-sky-500 dark:text-sky-400",
  WARNING:  "text-amber-500 dark:text-amber-400",
  CRITICAL: "text-red-500 dark:text-red-400",
};

interface SeverityIconProps {
  severity: AlertSeverity;
  size?: number;
  className?: string;
}

export const SeverityIcon = ({ severity, size = 16, className = "" }: SeverityIconProps) => {
  const Icon = severityIconMap[severity] || Info;
  const color = severityColorMap[severity] || "text-slate-400 dark:text-slate-500";
  return <Icon size={size} className={`${color} ${className}`.trim()} />;
};