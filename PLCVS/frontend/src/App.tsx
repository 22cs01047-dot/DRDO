import { useEffect, useState, useCallback } from "react";
import { useSession } from "./hooks/useSession";
import { useSessionStore } from "./store/sessionStore";
import { Header } from "./components/Header";
import { TunnelProgress } from "./components/TunnelProgress";
import { StageDetailPanel } from "./components/StageDetailPanel";
import { RightPanel } from "./components/RightPanel";
import { SessionReport } from "./components/SessionReport";
import { ApiTestDashboard } from "./components/ApiTestDashboard";
import { StartSessionModal } from "./components/StartSessionModal";
import { LoadingScreen } from "./components/LoadingScreen";
import { ConfigDrawer } from "./components/ConfigDrawer";
import { SessionHistoryDrawer } from "./components/SessionHistoryDrawer";
import { CheckCircle2 } from "lucide-react";

export const App = () => {
  const {
    session, stages, progress, alerts, unacknowledgedAlerts,
    transcriptions, audioLevel, activeStageId, systemReady,
    isConnected, isAllComplete, manualOverride, startSession,
    stopSession, pauseSession, resumeSession, loadConfig,
    resetSession, setActiveStage, acknowledgeAlert,
  } = useSession();

  const [showReport, setShowReport] = useState(false);
  const [showApiDashboard, setShowApiDashboard] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // CHANGE: Drawer states
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  const lastSessionAck = useSessionStore((s) => s.lastSessionAck);

  useEffect(() => { loadConfig().then(() => setConfigLoaded(true)); }, [loadConfig]);
  useEffect(() => { if (session.status === "COMPLETED") setShowReport(true); }, [session.status]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") { e.preventDefault(); setShowApiDashboard((v) => !v); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const handleStart = useCallback(() => setShowStartModal(true), []);
  const handleStartConfirm = useCallback(
    (operatorName: string) => { setShowStartModal(false); startSession(session.missionId || "DEFAULT", operatorName); },
    [session.missionId, startSession]
  );

  if (!configLoaded) return <LoadingScreen />;

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors duration-300" data-state={session.status}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50
                                          focus:px-4 focus:py-2 focus:bg-slate-900 dark:focus:bg-white focus:text-white dark:focus:text-slate-900
                                          focus:rounded-md focus:text-sm focus:font-medium">Skip to main content</a>

      {/* Header */}
      <div className="flex-shrink-0 h-14">
        <Header
          session={session} isConnected={isConnected} systemReady={systemReady}
          lastSessionAck={lastSessionAck}
          onStart={handleStart} onStop={stopSession} onPause={pauseSession} onResume={resumeSession}
          onReset={() => { resetSession(); setConfigLoaded(false); loadConfig().then(() => setConfigLoaded(true)); }}
          onOpenConfig={() => setShowConfigDrawer(true)}
          onOpenHistory={() => setShowHistoryDrawer(true)}
        />
      </div>

      {/* Tunnel Progress */}
      <section className="flex-shrink-0 py-2 px-2 md:px-4 bg-white dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 transition-colors">
        <TunnelProgress stages={stages} activeStageId={activeStageId} onStageClick={setActiveStage}
          overallProgress={progress.overallProgress} sessionStatus={session.status}
          alerts={alerts} compact highlightNextAction showTooltips />
      </section>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 px-2 md:px-3 py-2 min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* Left Panel */}
        <main id="main-content"
          className="flex flex-col min-w-0 w-full lg:w-3/5 min-h-[50vh] lg:min-h-0 flex-shrink-0 lg:flex-shrink
                     bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700
                     shadow-sm dark:shadow-slate-900/20 overflow-hidden transition-colors" role="main">
          <div className="flex-shrink-0 px-3 md:px-4 py-2.5 border-b border-slate-100 dark:border-slate-700
                          bg-gradient-to-r from-slate-50 dark:from-slate-800 to-white dark:to-slate-800 transition-colors">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Stage Details</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {activeStageId ? stages.find((s) => s.id === activeStageId)?.name || "Select a stage" : "No stage selected"}
                </p>
              </div>
              {activeStageId && (
                <span className="px-2 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-md text-[10px] font-medium transition-colors flex-shrink-0 ml-2">
                  Stage {stages.find((s) => s.id === activeStageId)?.order}
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto min-h-0 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-400 dark:hover:scrollbar-thumb-slate-500">
            <StageDetailPanel stages={stages} activeStageId={activeStageId} onStageClick={setActiveStage} onManualOverride={manualOverride} />
          </div>
          {isAllComplete && (
            <div className="flex-shrink-0 mx-3 md:mx-4 mb-3 md:mb-4 p-3 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-500/10 dark:to-emerald-500/5
                            border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-center animate-fade-in transition-colors" role="status" aria-live="polite">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">All Checklist Items Verified</p>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400/80 mb-2">Pre-launch checklist complete. Ready for launch authority review.</p>
              <button onClick={() => setShowReport(true)}
                className="px-4 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white rounded-md text-xs font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors shadow-sm">
                View Report
              </button>
            </div>
          )}
        </main>

        {/* Right Panel */}
        <aside className="flex flex-col min-w-0 overflow-hidden w-full lg:w-2/5 min-h-[45vh] lg:min-h-0 flex-shrink-0 lg:flex-shrink">
          <RightPanel
            audioLevel={audioLevel} isConnected={isConnected}
            transcriptions={transcriptions} alerts={alerts}
            unacknowledgedCount={unacknowledgedAlerts.length}
            onAcknowledge={acknowledgeAlert} stages={stages} onOverride={manualOverride}
            onOpenHistory={() => setShowHistoryDrawer(true)}
          />
        </aside>
      </div>

      {/* Modals */}
      {showReport && (
        <SessionReport session={session} stages={stages} progress={progress}
          transcriptions={transcriptions} alerts={alerts} onClose={() => setShowReport(false)} />
      )}
      {showApiDashboard && <ApiTestDashboard onClose={() => setShowApiDashboard(false)} />}
      {showStartModal && <StartSessionModal onConfirm={handleStartConfirm} onCancel={() => setShowStartModal(false)} />}

      {/* CHANGE: Slide-over drawers */}
      <ConfigDrawer isOpen={showConfigDrawer} onClose={() => setShowConfigDrawer(false)} />
      <SessionHistoryDrawer isOpen={showHistoryDrawer} onClose={() => setShowHistoryDrawer(false)} />
    </div>
  );
};