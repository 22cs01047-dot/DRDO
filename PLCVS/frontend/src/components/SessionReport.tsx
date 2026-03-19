import { useEffect, useRef } from "react";
import { X, FileText, Clock, BarChart3, Mic, AlertTriangle, PenLine, Target } from "lucide-react";
import { StatusIcon, SeverityIcon } from "./StatusIcon";
import type { StageData, TranscriptionSegment, Alert, ProgressData, SessionInfo } from "../types";
import { STATUS_LABELS, SEVERITY_COLORS } from "../utils/constants";
import { formatTimestamp, formatDateTime, calculateDuration } from "../utils/helpers";

interface SessionReportProps {
  session: SessionInfo;
  stages: StageData[];
  progress: ProgressData;
  transcriptions: TranscriptionSegment[];
  alerts: Alert[];
  onClose: () => void;
}

export const SessionReport = ({
  session, stages, progress, transcriptions, alerts, onClose,
}: SessionReportProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  const manualOverrides = stages.reduce(
    (acc, s) => acc + s.items.filter((i) => i.updatedBy === "MANUAL_OVERRIDE").length, 0
  );
  const avgConfidence = transcriptions.length > 0
    ? transcriptions.reduce((sum, t) => sum + t.confidence, 0) / transcriptions.length : 0;
  const criticalAlerts = alerts.filter((a) => a.severity === "CRITICAL").length;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", handleTab);
    return () => dialog.removeEventListener("keydown", handleTab);
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]
                 flex items-center justify-center z-50 p-2 md:p-4"
      role="dialog" aria-modal="true" aria-labelledby="report-title"
    >
      <div
        ref={dialogRef}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl dark:shadow-slate-900/50
                   w-full max-w-4xl max-h-[95vh] md:max-h-[90vh] overflow-hidden flex flex-col
                   border border-slate-200 dark:border-slate-700
                   print:max-h-none print:shadow-none print:border-0 print:rounded-none"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4
                     border-b border-slate-200 dark:border-slate-700
                     bg-slate-50/50 dark:bg-slate-800/80 flex-shrink-0
                     print:bg-white print:border-slate-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-slate-900 dark:bg-slate-600 flex items-center justify-center print:bg-slate-800">
              <FileText size={16} className="text-white" />
            </div>
            <div>
              <h2 id="report-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 print:text-black">
                Session Report
              </h2>
              <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                {session.missionName || "Mission Report"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors
                       print:hidden"
            aria-label="Close report"
          >
            <X size={18} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-on-hover p-4 md:p-6 space-y-6 md:space-y-8
                        print:overflow-visible print:p-0 print:space-y-4">

          {/* Summary Grid — RESPONSIVE: 2 cols on mobile, 4 on md+ */}
          <section aria-labelledby="summary-heading">
            <h3 id="summary-heading"
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3
                           print:text-black print:text-sm">
              Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              <StatCard icon={<Target size={14} className="text-slate-400 dark:text-slate-500" />}
                        label="Overall Progress" value={`${progress.overallProgress}%`} />
              <StatCard icon={<Clock size={14} className="text-slate-400 dark:text-slate-500" />}
                        label="Duration" value={calculateDuration(session.startTime, session.endTime)} />
              <StatCard icon={<Mic size={14} className="text-slate-400 dark:text-slate-500" />}
                        label="Transcriptions" value={String(transcriptions.length)} />
              <StatCard icon={<BarChart3 size={14} className="text-slate-400 dark:text-slate-500" />}
                        label="Avg Confidence" value={`${(avgConfidence * 100).toFixed(1)}%`} />
              <StatCard label="Confirmed" value={String(progress.confirmedItems)}
                        valueColor="text-emerald-700 dark:text-emerald-400" />
              <StatCard label="Failed" value={String(progress.failedItems)}
                        valueColor="text-red-600 dark:text-red-400" />
              <StatCard icon={<AlertTriangle size={14} className="text-amber-400" />}
                        label="Alerts" value={String(alerts.length)}
                        valueColor={criticalAlerts > 0 ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"} />
              <StatCard icon={<PenLine size={14} className="text-amber-400" />}
                        label="Manual Overrides" value={String(manualOverrides)}
                        valueColor={manualOverrides > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"} />
            </div>
          </section>

          {/* Stage Breakdown */}
          <section aria-labelledby="stages-heading">
            <h3 id="stages-heading"
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3
                           print:text-black print:text-sm">
              Stage Breakdown
            </h3>
            <div className="space-y-3 print:space-y-2">
              {stages.map((stage) => (
                <div key={stage.id}
                     className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden
                                print:border-slate-300 print:break-inside-avoid">
                  <div className="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3
                                  bg-slate-50/50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700
                                  print:bg-slate-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusIcon status={stage.status} size={14} />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        Stage {stage.order}: {stage.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-2xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                        {STATUS_LABELS[stage.status] || stage.status}
                      </span>
                      <span className="text-2xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                        {stage.progress}%
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {stage.items.map((item) => (
                      <div key={item.id}
                           className="flex items-center justify-between px-3 md:px-4 py-2 md:py-2.5 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusIcon status={item.status} size={13} />
                          <span className="text-slate-700 dark:text-slate-300 truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 text-2xs text-slate-400 dark:text-slate-500">
                          <span>
                            {item.updatedBy === "MANUAL_OVERRIDE"
                              ? <span className="text-amber-600 dark:text-amber-400 font-medium">Manual</span>
                              : <span className="hidden sm:inline">Auto</span>}
                          </span>
                          {item.confidence > 0 && (
                            <span className="tabular-nums hidden sm:inline">
                              {(item.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                          {item.timestamp && (
                            <span className="tabular-nums">{formatTimestamp(item.timestamp)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Alerts */}
          {alerts.length > 0 && (
            <section aria-labelledby="alerts-heading">
              <h3 id="alerts-heading"
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3
                             print:text-black print:text-sm">
                Alerts ({alerts.length})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-on-hover print:max-h-none print:overflow-visible">
                {alerts.map((alert) => {
                  const cfg = SEVERITY_COLORS[alert.severity];
                  return (
                    <div key={alert.id}
                         className={`flex items-start gap-2.5 p-2.5 rounded-md border-l-2 text-sm ${cfg.bg} ${cfg.border}
                                     print:bg-transparent print:rounded-none`}>
                      <SeverityIcon severity={alert.severity} size={13} />
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium ${cfg.text}`}>{alert.message}</span>
                      </div>
                      <span className="text-2xs text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                        {formatTimestamp(alert.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Session Metadata — RESPONSIVE: 1 col on mobile, 2 on sm+ */}
          <section className="border-t border-slate-200 dark:border-slate-700 pt-4 print:border-slate-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-500 dark:text-slate-400">
              <MetaRow label="Session ID" value={session.sessionId} mono />
              <MetaRow label="Operator" value={session.operatorName || "—"} />
              <MetaRow label="Started" value={formatDateTime(session.startTime)} />
              <MetaRow label="Ended" value={formatDateTime(session.endTime)} />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 md:px-6 py-3 md:py-4
                        border-t border-slate-200 dark:border-slate-700
                        bg-slate-50/50 dark:bg-slate-800/80 flex-shrink-0
                        print:hidden">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-white dark:text-slate-900
                       bg-slate-900 dark:bg-slate-100 rounded-md
                       hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({
  icon, label, value, valueColor = "text-slate-900 dark:text-slate-100",
}: {
  icon?: React.ReactNode; label: string; value: string; valueColor?: string;
}) => (
  <div className="bg-slate-50 dark:bg-slate-700/40 rounded-md p-2.5 md:p-3 transition-colors
                  print:bg-slate-100 print:border print:border-slate-200">
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <p className="text-2xs text-slate-400 dark:text-slate-500 font-medium">{label}</p>
    </div>
    <p className={`text-base md:text-lg font-bold tabular-nums ${valueColor} print:text-black`}>{value}</p>
  </div>
);

const MetaRow = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-2xs text-slate-400 dark:text-slate-500 w-20 flex-shrink-0">{label}</span>
    <span className={`text-2xs text-slate-600 dark:text-slate-400 truncate ${mono ? "font-mono" : ""}`}>
      {value}
    </span>
  </div>
);