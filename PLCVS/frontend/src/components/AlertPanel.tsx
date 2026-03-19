import { Bell } from "lucide-react";
import { SeverityIcon } from "./StatusIcon";
import type { Alert } from "../types";
import { SEVERITY_COLORS } from "../utils/constants";
import { formatTimestamp } from "../utils/helpers";

interface AlertPanelProps {
  alerts: Alert[];
  onAcknowledge: (alertId: string) => void;
}

export const AlertPanel = ({ alerts, onAcknowledge }: AlertPanelProps) => {
  const criticalCount = alerts.filter((a) => a.severity === "CRITICAL" && !a.acknowledged).length;

  return (
    <div aria-label="System alerts">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-slate-400 dark:text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Alerts
          </h3>
        </div>
        {criticalCount > 0 && (
          <span className="text-2xs px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-500/15
                           text-red-700 dark:text-red-400 font-bold">
            {criticalCount} Critical
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-on-hover">
        {alerts.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-8">
            No alerts. All systems nominal.
          </p>
        ) : (
          alerts.map((alert) => {
            const cfg = SEVERITY_COLORS[alert.severity];
            return (
              <div
                key={alert.id}
                className={`
                  p-3 rounded-md border-l-2 text-sm transition-opacity
                  ${cfg.bg} ${cfg.border}
                  ${alert.acknowledged ? "opacity-40" : ""}
                `}
                role="alert"
                aria-live={alert.severity === "CRITICAL" ? "assertive" : "polite"}
              >
                <div className="flex items-start gap-2.5">
                  <SeverityIcon severity={alert.severity} size={15} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm ${cfg.text}`}>{alert.message}</p>
                    {alert.suggestion && (
                      <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">
                        {alert.suggestion}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1.5 text-2xs text-slate-400 dark:text-slate-500">
                      <span className="tabular-nums">{formatTimestamp(alert.timestamp)}</span>
                      <span className="font-mono">{alert.ruleId}</span>
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <button
                      onClick={() => onAcknowledge(alert.id)}
                      className="text-2xs px-2 py-1 border border-slate-200 dark:border-slate-600
                                 text-slate-600 dark:text-slate-400
                                 hover:bg-slate-100 dark:hover:bg-slate-700
                                 rounded transition-colors flex-shrink-0"
                      aria-label={`Acknowledge alert: ${alert.message}`}
                    >
                      ACK
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};