/**
 * Session management hook — wraps store actions with WebSocket commands.
 */

import { useCallback, useMemo } from "react";
import { useSessionStore } from "../store/sessionStore";
import { useWebSocket } from "./useWebSocket";
import { generateId } from "../utils/helpers";
import type { ItemStatus, StageData, ChecklistItemData, ChecklistConfig } from "../types";
import { getChecklistConfig } from "../api/checklist";
import {
  startSession as apiStartSession,
  stopSession as apiStopSession,
  pauseSession as apiPauseSession,
  resumeSession as apiResumeSession,
  manualOverride as apiManualOverride,
} from "../api/session";

/** Backend now supports pause/resume — REST-first with WS fallback. */

export function useSession() {
  const { sendCommand, isConnected, reconnectAttempts, connect } = useWebSocket();

  const session = useSessionStore((s) => s.session);
  const stages = useSessionStore((s) => s.stages);
  const progress = useSessionStore((s) => s.progress);
  const alerts = useSessionStore((s) => s.alerts);
  const transcriptions = useSessionStore((s) => s.transcriptions);
  const audioLevel = useSessionStore((s) => s.audioLevel);
  const systemReady = useSessionStore((s) => s.systemReady);
  const activeStageId = useSessionStore((s) => s.activeStageId);

  const initSession = useSessionStore((s) => s.initSession);
  const loadStages = useSessionStore((s) => s.loadStages);
  const resetSession = useSessionStore((s) => s.resetSession);
  const setActiveStage = useSessionStore((s) => s.setActiveStage);
  const acknowledgeAlert = useSessionStore((s) => s.acknowledgeAlert);
  const manualOverrideStore = useSessionStore((s) => s.manualOverride);
  const setSessionStatus = useSessionStore((s) => s.setSessionStatus);
  const setLastSessionAck = useSessionStore((s) => s.setLastSessionAck);

  // ── Start Session ──────────────────────────────────────

  const startSession = useCallback(
    async (missionId: string, operatorName: string) => {
      const clientSessionId = generateId("session");

      // Optimistic local update so the UI switches to RUNNING immediately
      initSession({
        sessionId: clientSessionId,
        missionId,
        operatorName,
        status: "RUNNING",
        startTime: new Date().toISOString(),
      });

      // Dual path: try REST first, then fall back to WS
      try {
        const resp = await apiStartSession({ mission_config: missionId });
        // Use the backend-assigned session_id if available
        if (resp.session_id) {
          initSession({ sessionId: resp.session_id });
        }
        setLastSessionAck({ type: "STARTED", timestamp: new Date().toISOString() });
      } catch {
        // REST failed — fall back to WebSocket command
        sendCommand({
          type: "START_SESSION",
          sessionId: clientSessionId,
          missionId,
          operatorName,
        });
      }
    },
    [initSession, sendCommand, setLastSessionAck]
  );

  // ── Stop Session ───────────────────────────────────────

  const stopSession = useCallback(() => {
    // Optimistic — switch UI instantly (no await = zero latency)
    const prevStatus = useSessionStore.getState().session.status;
    setSessionStatus("COMPLETED");

    // Fire-and-forget: REST confirmation runs in the background
    apiStopSession()
      .then((resp) => {
        const newStatus = resp.status === "ABORTED" ? "ABORTED" : "COMPLETED";
        setSessionStatus(newStatus);
        setLastSessionAck({ type: "STOPPED", timestamp: new Date().toISOString() });
      })
      .catch(() => {
        // REST failed — revert optimistic update, try WS fallback
        setSessionStatus(prevStatus);
        sendCommand({ type: "STOP_SESSION" });
      });
  }, [sendCommand, setSessionStatus, setLastSessionAck]);

  // ── Pause / Resume ─────────────────────────────────────

  const pauseSession = useCallback(() => {
    // Optimistic — switch UI instantly (no await = zero latency)
    const prevStatus = useSessionStore.getState().session.status;
    setSessionStatus("PAUSED");

    // Fire-and-forget: REST confirmation runs in the background
    apiPauseSession()
      .then(() => {
        setLastSessionAck({ type: "PAUSED", timestamp: new Date().toISOString() });
      })
      .catch(() => {
        setSessionStatus(prevStatus);
        sendCommand({ type: "PAUSE_SESSION" });
      });
  }, [sendCommand, setSessionStatus, setLastSessionAck]);

  const resumeSession = useCallback(() => {
    // Optimistic — switch UI instantly (no await = zero latency)
    const prevStatus = useSessionStore.getState().session.status;
    setSessionStatus("RUNNING");

    // Fire-and-forget: REST confirmation runs in the background
    apiResumeSession()
      .then(() => {
        setLastSessionAck({ type: "RESUMED", timestamp: new Date().toISOString() });
      })
      .catch(() => {
        setSessionStatus(prevStatus);
        sendCommand({ type: "RESUME_SESSION" });
      });
  }, [sendCommand, setSessionStatus, setLastSessionAck]);

  // ── Manual Override ────────────────────────────────────

  const manualOverride = useCallback(
    async (itemId: string, stageId: string, status: ItemStatus, notes = "") => {
      // Optimistic local update
      manualOverrideStore(itemId, stageId, status, notes);

      // Dual path: try REST, fall back to WS
      try {
        await apiManualOverride({ item_id: itemId, status });
      } catch {
        sendCommand({
          type: "MANUAL_OVERRIDE",
          itemId,
          stageId,
          status,
          notes,
        });
      }
    },
    [manualOverrideStore, sendCommand]
  );

  // ── Replay Audio ───────────────────────────────────────

  const replayAudio = useCallback(
    (audioFile: string) => {
      sendCommand({ type: "REPLAY_AUDIO", audioFile });
    },
    [sendCommand]
  );

  // ── Load Config from Backend ───────────────────────────

  const loadConfig = useCallback(async () => {
    try {
      const config = await getChecklistConfig();

      initSession({
        missionId: config.mission.id,
        missionName: config.mission.name,
      });

      const stageData: StageData[] = config.stages.map((stg) => ({
        id: stg.id,
        name: stg.name,
        order: stg.order,
        status: "PENDING",
        dependencyType: stg.type,
        dependsOn: stg.dependency,
        progress: 0,
        items: stg.checklist_items.map(
          (ci): ChecklistItemData => ({
            id: ci.id,
            name: ci.name,
            status: "PENDING",
            confidence: 0,
            matchedText: "",
            timestamp: null,
            updatedBy: "AUTO",
            mandatory: ci.mandatory,
            orderInStage: ci.order_in_stage,
            audioSegmentId: null,
            notes: "",
          })
        ),
      }));

      loadStages(stageData);
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  }, [initSession, loadStages]);

  // ── Derived values ─────────────────────────────────────

  const activeStage = useMemo(
    () => stages.find((s) => s.id === activeStageId) ?? null,
    [stages, activeStageId]
  );

  const unacknowledgedAlerts = useMemo(
    () => alerts.filter((a) => !a.acknowledged),
    [alerts]
  );

  const criticalAlertCount = useMemo(
    () => unacknowledgedAlerts.filter((a) => a.severity === "CRITICAL").length,
    [unacknowledgedAlerts]
  );

  const isAllComplete = useMemo(() => progress.overallProgress === 100, [progress]);

  return {
    // State
    session,
    stages,
    progress,
    alerts,
    unacknowledgedAlerts,
    criticalAlertCount,
    transcriptions,
    audioLevel,
    activeStage,
    activeStageId,
    systemReady,
    isConnected,
    reconnectAttempts,
    isAllComplete,

    // Actions
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
    manualOverride,
    replayAudio,
    loadConfig,
    resetSession,
    setActiveStage,
    acknowledgeAlert,
    connect,
  };
}
