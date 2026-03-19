/**
 * SessionHistoryDrawer — full session history view in a slide-over drawer.
 */

import { useEffect, useState } from "react";
import { History, Clock, RefreshCw, ChevronDown, ChevronRight, BarChart3 } from "lucide-react";
import { SlideDrawer } from "./SlideDrawer";
import { useSessionHistory } from "../hooks/useSessionHistory";
import { formatDateTime, calculateDuration } from "../utils/helpers";

interface SessionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const statusStyle: Record<string, { bg: string; dot: string }> = {
  COMPLETED: { bg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400", dot: "bg-emerald-500" },
  ABORTED:   { bg: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400", dot: "bg-red-500" },
  ACTIVE:    { bg: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400", dot: "bg-sky-500" },
  PAUSED:    { bg: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400", dot: "bg-amber-500" },
};

export const SessionHistoryDrawer = ({ isOpen, onClose }: SessionHistoryDrawerProps) => {
  const { sessions, isLoading, error, load } = useSessionHistory();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) load(50);
  }, [isOpen, load]);

  return (
    <SlideDrawer
      isOpen={isOpen} onClose={onClose}
      title="Session History"
      subtitle={`${sessions.length} sessions recorded`}
      icon={<History size={16} className="text-white" />}
      width="max-w-xl"
    >
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3
                      border-b border-slate-100 dark:border-slate-700
                      bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => load(50)}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                     bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300
                     rounded-md hover:bg-slate-200 dark:hover:bg-slate-600
                     disabled:opacity-50 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="p-5">
        {error && (
          <div className="p-3 mb-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30
                          rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {sessions.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <History size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No sessions recorded yet.</p>
          </div>
        )}

        <div className="space-y-3">
          {sessions.map((s) => {
            const stStyle = statusStyle[s.status] || statusStyle.COMPLETED;
            const isExpanded = expandedId === s.session_id;

            return (
              <div key={s.session_id}
                   className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden
                              bg-white dark:bg-slate-700/30 transition-colors">
                {/* Session card header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : s.session_id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left
                             hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors"
                  aria-expanded={isExpanded}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1.5 text-2xs px-2 py-0.5 rounded-full font-medium ${stStyle.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${stStyle.dot}`} />
                        {s.status}
                      </span>
                      {s.mission_name && (
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                          {s.mission_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-2xs text-slate-400 dark:text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock size={10} /> {formatDateTime(s.start_time)}
                      </span>
                      {s.end_time && (
                        <span>Duration: {calculateDuration(s.start_time, s.end_time)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Progress ring */}
                    <div className="relative w-10 h-10">
                      <svg width="40" height="40" className="transform -rotate-90">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor"
                                className="text-slate-100 dark:text-slate-600" strokeWidth="3" />
                        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor"
                                className={s.overall_progress >= 100 ? "text-emerald-500" : "text-blue-500"}
                                strokeWidth="3" strokeLinecap="round"
                                strokeDasharray={`${(s.overall_progress / 100) * 100.5} 100.5`} />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-600 dark:text-slate-400">
                        {Math.round(s.overall_progress)}%
                      </span>
                    </div>
                    {isExpanded
                      ? <ChevronDown size={14} className="text-slate-400" />
                      : <ChevronRight size={14} className="text-slate-400" />
                    }
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 dark:bg-slate-700/40 rounded-md p-2.5">
                        <span className="text-2xs text-slate-400 dark:text-slate-500">Session ID</span>
                        <p className="font-mono text-slate-600 dark:text-slate-400 text-2xs mt-0.5 truncate">{s.session_id}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-700/40 rounded-md p-2.5">
                        <span className="text-2xs text-slate-400 dark:text-slate-500">Progress</span>
                        <p className="font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{s.overall_progress.toFixed(1)}%</p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-600 rounded-full overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          s.overall_progress >= 100 ? "bg-emerald-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${s.overall_progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SlideDrawer>
  );
};