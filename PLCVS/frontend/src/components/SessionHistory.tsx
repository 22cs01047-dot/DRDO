import { useEffect } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { useSessionHistory } from "../hooks/useSessionHistory";
import { formatDateTime } from "../utils/helpers";

const statusStyle: Record<string, string> = {
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  ABORTED:   "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  ACTIVE:    "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400",
  PAUSED:    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
};

export const SessionHistory = ({ autoLoad = true }: { autoLoad?: boolean }) => {
  const { sessions, isLoading, error, load } = useSessionHistory();

  useEffect(() => { if (autoLoad) load(20); }, [autoLoad, load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400">Session History</h4>
        <button
          onClick={() => load(20)}
          disabled={isLoading}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
          aria-label="Refresh session history"
        >
          <RefreshCw size={12} className={`text-slate-400 dark:text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && <p className="text-2xs text-red-600 dark:text-red-400 mb-2">{error}</p>}

      {sessions.length === 0 && !isLoading && !error && (
        <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-4">No past sessions.</p>
      )}

      {sessions.length > 0 && (
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {sessions.map((s) => (
            <div key={s.session_id}
                 className="border border-slate-100 dark:border-slate-600 rounded-md p-3 text-sm
                            bg-white dark:bg-slate-700/30">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-2xs text-slate-400 dark:text-slate-500 truncate max-w-[160px]">
                  {s.session_id}
                </span>
                <span className={`text-2xs px-2 py-0.5 rounded-md font-medium ${
                  statusStyle[s.status] || "bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-300"
                }`}>
                  {s.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-2xs text-slate-500 dark:text-slate-400">
                {s.mission_name && <span>{s.mission_name}</span>}
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {formatDateTime(s.start_time)}
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                  {s.overall_progress.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};