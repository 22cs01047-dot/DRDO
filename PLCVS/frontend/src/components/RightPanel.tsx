/**
 * RightPanel — tabbed side panel for session monitoring.
 *
 * CHANGE: Removed SessionHistory from Tools tab (moved to drawer).
 * Added onOpenHistory callback. Added selectedDeviceId state
 * threaded between AudioMonitor and AudioDeviceList.
 */

import { useState, useMemo } from "react";
import { Radio, Bell, PenSquare, Wrench } from "lucide-react";
import type { AudioLevel, TranscriptionSegment, Alert, StageData, ItemStatus } from "../types";
import { AudioMonitor } from "./AudioMonitor";
import { TranscriptFeed } from "./TranscriptFeed";
import { AlertPanel } from "./AlertPanel";
import { ManualOverride } from "./ManualOverride";
import { AudioTranscriber } from "./AudioTranscriber";
import { AudioDeviceList } from "./AudioDeviceList";

type TabId = "live" | "alerts" | "override" | "tools";

interface Tab { id: TabId; label: string; icon: typeof Radio; badge?: boolean; }

const tabs: Tab[] = [
  { id: "live", label: "Live", icon: Radio },
  { id: "alerts", label: "Alerts", icon: Bell, badge: true },
  { id: "override", label: "Override", icon: PenSquare },
  { id: "tools", label: "Tools", icon: Wrench },
];

const TAB_ACTIVE_CLASSES: Record<string, { text: string; icon: string; border: string }> = {
  blue:   { text: "text-blue-700 dark:text-blue-400",     icon: "text-blue-600 dark:text-blue-400",     border: "#3b82f6" },
  amber:  { text: "text-amber-700 dark:text-amber-400",   icon: "text-amber-600 dark:text-amber-400",   border: "#f59e0b" },
  red:    { text: "text-red-700 dark:text-red-400",       icon: "text-red-600 dark:text-red-400",       border: "#ef4444" },
  purple: { text: "text-purple-700 dark:text-purple-400", icon: "text-purple-600 dark:text-purple-400", border: "#8b5cf6" },
  slate:  { text: "text-slate-700 dark:text-slate-300",   icon: "text-slate-600 dark:text-slate-400",   border: "#64748b" },
};

interface RightPanelProps {
  audioLevel: AudioLevel;
  isConnected: boolean;
  transcriptions: TranscriptionSegment[];
  alerts: Alert[];
  unacknowledgedCount: number;
  onAcknowledge: (alertId: string) => void;
  stages: StageData[];
  onOverride: (itemId: string, stageId: string, status: ItemStatus, notes: string) => void;
  onOpenHistory?: () => void;
}

export const RightPanel = ({
  audioLevel, isConnected, transcriptions, alerts,
  unacknowledgedCount, onAcknowledge, stages, onOverride,
  onOpenHistory,
}: RightPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabId>("live");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const criticalCount = useMemo(
    () => alerts.filter((a) => a.severity === "CRITICAL" && !a.acknowledged).length,
    [alerts]
  );

  const getTabColor = (tabId: TabId): string => {
    switch (tabId) {
      case "live":     return "blue";
      case "alerts":   return criticalCount > 0 ? "red" : "amber";
      case "override": return "purple";
      case "tools":    return "slate";
      default:         return "slate";
    }
  };

  return (
    <aside
      className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl
                 border border-slate-200 dark:border-slate-700
                 shadow-sm dark:shadow-slate-900/20 overflow-hidden transition-colors"
      role="complementary" aria-label="Session monitoring panel"
    >
      {/* Tab Bar */}
      <nav className="flex-shrink-0 flex border-b border-slate-200 dark:border-slate-700
                      bg-slate-50/80 dark:bg-slate-800/80" role="tablist" aria-label="Panel tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const showBadge = tab.badge && unacknowledgedCount > 0;
          const colorKey = getTabColor(tab.id);
          const colorClasses = TAB_ACTIVE_CLASSES[colorKey] || TAB_ACTIVE_CLASSES.slate;

          return (
            <button key={tab.id} role="tab" aria-selected={isActive}
              aria-controls={`panel-${tab.id}`} id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium
                          transition-all duration-200 relative min-h-[40px]
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/50
                          ${isActive
                            ? `bg-white dark:bg-slate-700 ${colorClasses.text}`
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-700/40"
                          }`}
              style={{
                borderBottom: isActive ? `2px solid ${colorClasses.border}` : "2px solid transparent",
                marginBottom: isActive ? "-2px" : "0",
              }}
            >
              <Icon size={14}
                className={`transition-colors ${isActive ? colorClasses.icon
                  : tab.id === "alerts" && unacknowledgedCount > 0 ? "text-amber-500 dark:text-amber-400"
                  : "text-slate-400 dark:text-slate-500"}`} />
              <span className="hidden sm:inline">{tab.label}</span>
              {showBadge && (
                <span className={`min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px]
                                  font-bold leading-none px-1 ${criticalCount > 0
                                    ? "bg-red-500 text-white animate-pulse" : "bg-amber-500 text-white"}`}
                  aria-label={`${unacknowledgedCount} unacknowledged alerts`}>
                  {unacknowledgedCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin
                      scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600
                      scrollbar-track-transparent hover:scrollbar-thumb-slate-400 dark:hover:scrollbar-thumb-slate-500"
        role="region" aria-label="Panel content">

        {activeTab === "live" && (
          <div id="panel-live" role="tabpanel" aria-labelledby="tab-live" className="p-3 space-y-3">
            <AudioMonitor audioLevel={audioLevel} isConnected={isConnected} selectedDeviceId={selectedDeviceId} />
            <TranscriptFeed transcriptions={transcriptions} />
          </div>
        )}

        {activeTab === "alerts" && (
          <div id="panel-alerts" role="tabpanel" aria-labelledby="tab-alerts" className="p-3">
            <AlertPanel alerts={alerts} onAcknowledge={onAcknowledge} />
          </div>
        )}

        {activeTab === "override" && (
          <div id="panel-override" role="tabpanel" aria-labelledby="tab-override" className="p-3">
            <ManualOverride stages={stages} onOverride={onOverride} />
          </div>
        )}

        {activeTab === "tools" && (
          <div id="panel-tools" role="tabpanel" aria-labelledby="tab-tools" className="p-3 space-y-3">
            <AudioTranscriber />
            <AudioDeviceList selectedDeviceId={selectedDeviceId} onDeviceSelect={setSelectedDeviceId} />

            {/* CHANGE: SessionHistory moved to drawer — show link button */}
            {onOpenHistory && (
              <button
                onClick={onOpenHistory}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md
                           border border-slate-200 dark:border-slate-600
                           text-xs font-medium text-slate-600 dark:text-slate-400
                           hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                View Full Session History →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Panel Footer */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-slate-100 dark:border-slate-700
                      bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400 dark:bg-slate-600"}`} />
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          <span>
            {activeTab === "alerts" && criticalCount > 0 ? (
              <span className="text-red-600 dark:text-red-400 font-medium">⚠ {criticalCount} critical</span>
            ) : (`${transcriptions.length} transcripts`)}
          </span>
        </div>
      </div>
    </aside>
  );
};