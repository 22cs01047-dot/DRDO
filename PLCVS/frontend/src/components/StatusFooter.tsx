import { Wifi, WifiOff, Cpu, AlertTriangle } from "lucide-react";
import type { ProgressData } from "../types";

interface StatusFooterProps {
  progress: ProgressData;
  isConnected: boolean;
  systemReady: boolean;
  sessionStatus: string;
  alertCount: number;
}

export const StatusFooter = ({
  progress, isConnected, systemReady, sessionStatus, alertCount,
}: StatusFooterProps) => {
  const idle = sessionStatus === "IDLE";

  return (
    <footer
      className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700
                 px-6 py-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400
                 flex-shrink-0 transition-colors"
      role="contentinfo"
    >
      {/* Left: progress stats */}
      <div className="flex items-center gap-4">
        {!idle && (
          <>
            <span className="tabular-nums">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{progress.confirmedItems}</span>
              /{progress.totalItems} confirmed
            </span>
            {progress.failedItems > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">
                {progress.failedItems} failed
              </span>
            )}
            {progress.ambiguousItems > 0 && (
              <span className="text-amber-600 dark:text-amber-400 tabular-nums">
                {progress.ambiguousItems} ambiguous
              </span>
            )}
          </>
        )}
        {alertCount > 0 && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
            <AlertTriangle size={12} />
            {alertCount} unacknowledged
          </span>
        )}
        {idle && <span className="text-slate-400 dark:text-slate-500">Ready to start session</span>}
      </div>

      {/* Right: system status */}
      <div className="flex items-center gap-4">
        <span className={`flex items-center gap-1 ${
          isConnected
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-500 dark:text-red-400"
        }`}>
          {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {isConnected ? "Connected" : "Offline"}
        </span>
        <span className={`flex items-center gap-1 ${
          systemReady
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-slate-400 dark:text-slate-500"
        }`}>
          <Cpu size={12} />
          Models {systemReady ? "Ready" : "Loading"}
        </span>
      </div>
    </footer>
  );
};