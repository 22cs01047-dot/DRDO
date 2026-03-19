/**
 * Zustand store — single source of truth for all session state.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  StageData,
  ChecklistItemData,
  TranscriptionSegment,
  Alert,
  ProgressData,
  SessionInfo,
  AudioLevel,
  ItemStatus,
  SessionStatus,
  UpdateSource,
  WSChecklistUpdateMessage,
  WSAlertMessage,
  WSTranscriptionMessage,
  WSProgressMessage,
  WSAudioLevelMessage,
} from "../types";
import {
  computeOverallProgress,
  computeStageProgress,
  deriveStageStatus,
  generateId,
} from "../utils/helpers";
import { MAX_TRANSCRIPT_HISTORY, MAX_ALERT_HISTORY } from "../utils/constants";

// ─── Session ACK Event ─────────────────────────────────────────

export type SessionAckType = "STARTED" | "STOPPED" | "PAUSED" | "RESUMED";

export interface SessionAckEvent {
  type: SessionAckType;
  timestamp: string;
}

// ─── Store Shape ───────────────────────────────────────────────

interface SessionState {
  // Connection
  wsConnected: boolean;
  systemReady: boolean;

  // Session
  session: SessionInfo;

  // Last backend ACK for session lifecycle events
  lastSessionAck: SessionAckEvent | null;

  // Checklist
  stages: StageData[];
  progress: ProgressData;

  // Live feeds
  transcriptions: TranscriptionSegment[];
  alerts: Alert[];

  // Audio
  audioLevel: AudioLevel;

  // UI state
  activeStageId: string | null;
  selectedItemId: string | null;
  sidebarOpen: boolean;

  // ── Actions ──────────────────────────────────────────────
  setWsConnected: (connected: boolean) => void;
  setSystemReady: (ready: boolean) => void;

  // Session
  initSession: (info: Partial<SessionInfo>) => void;
  setSessionStatus: (status: SessionStatus) => void;
  setLastSessionAck: (ack: SessionAckEvent) => void;
  resetSession: () => void;

  // Stages + Checklist — bulk load from config
  loadStages: (stages: StageData[]) => void;

  // Incoming WebSocket message handlers
  handleChecklistUpdate: (msg: WSChecklistUpdateMessage) => void;
  handleTranscription: (msg: WSTranscriptionMessage) => void;
  handleAlert: (msg: WSAlertMessage) => void;
  handleProgressUpdate: (msg: WSProgressMessage) => void;
  handleAudioLevel: (msg: WSAudioLevelMessage) => void;

  // Manual actions
  manualOverride: (itemId: string, stageId: string, status: ItemStatus, notes: string) => void;
  acknowledgeAlert: (alertId: string) => void;

  // UI
  setActiveStage: (stageId: string | null) => void;
  setSelectedItem: (itemId: string | null) => void;
  toggleSidebar: () => void;
}

// ─── Default Values ────────────────────────────────────────────

const defaultSession: SessionInfo = {
  sessionId: "",
  missionId: "",
  missionName: "",
  status: "IDLE",
  startTime: null,
  endTime: null,
  operatorName: "",
};

const defaultProgress: ProgressData = {
  overallProgress: 0,
  totalItems: 0,
  confirmedItems: 0,
  failedItems: 0,
  pendingItems: 0,
  ambiguousItems: 0,
  stages: {},
};

const defaultAudioLevel: AudioLevel = {
  rms: 0,
  peak: 0,
  isSpeech: false,
  timestamp: "",
};

// ─── Store ─────────────────────────────────────────────────────

export const useSessionStore = create<SessionState>()(
  devtools(
    (set, get) => ({
      // Initial state
      wsConnected: false,
      systemReady: false,
      session: { ...defaultSession },
      lastSessionAck: null,
      stages: [],
      progress: { ...defaultProgress },
      transcriptions: [],
      alerts: [],
      audioLevel: { ...defaultAudioLevel },
      activeStageId: null,
      selectedItemId: null,
      sidebarOpen: true,

      // ── Connection ───────────────────────────────────────

      setWsConnected: (connected) => set({ wsConnected: connected }),
      setSystemReady: (ready) => set({ systemReady: ready }),

      // ── Session ──────────────────────────────────────────

      initSession: (info) =>
        set((state) => ({
          session: { ...state.session, ...info },
        })),

      setSessionStatus: (status) =>
        set((state) => ({
          session: {
            ...state.session,
            status,
            ...(status === "RUNNING" && !state.session.startTime
              ? { startTime: new Date().toISOString() }
              : {}),
            ...(status === "COMPLETED" || status === "ABORTED"
              ? { endTime: new Date().toISOString() }
              : {}),
          },
        })),

      setLastSessionAck: (ack) => set({ lastSessionAck: ack }),

      resetSession: () =>
        set({
          session: { ...defaultSession },
          lastSessionAck: null,
          stages: [],
          progress: { ...defaultProgress },
          transcriptions: [],
          alerts: [],
          audioLevel: { ...defaultAudioLevel },
          activeStageId: null,
          selectedItemId: null,
        }),

      // ── Load stages from config ──────────────────────────

      loadStages: (stages) => {
        const progress = recalculateProgress(stages);
        set({
          stages,
          progress,
          activeStageId: stages.length > 0 ? stages[0].id : null,
        });
      },

      // ── Checklist Update ─────────────────────────────────

      handleChecklistUpdate: (msg) =>
        set((state) => {
          const newStages = state.stages.map((stage) => {
            if (stage.id !== msg.stageId) return stage;

            const newItems = stage.items.map((item) => {
              if (item.id !== msg.itemId) return item;
              return {
                ...item,
                status: msg.status,
                confidence: msg.confidence,
                matchedText: msg.matchedText,
                timestamp: msg.timestamp,
                updatedBy: msg.source,
              };
            });

            const newProgress = computeStageProgress(newItems);
            const newStatus = deriveStageStatus(newItems);

            return {
              ...stage,
              items: newItems,
              progress: newProgress,
              status: newStatus as StageData["status"],
            };
          });

          const progress = recalculateProgress(newStages);

          // Auto-advance active stage
          let activeStageId = state.activeStageId;
          const currentStage = newStages.find((s) => s.id === activeStageId);
          if (currentStage && currentStage.status === "CONFIRMED") {
            const currentIdx = newStages.indexOf(currentStage);
            if (currentIdx < newStages.length - 1) {
              activeStageId = newStages[currentIdx + 1].id;
            }
          }

          return { stages: newStages, progress, activeStageId };
        }),

      // ── Transcription ────────────────────────────────────

      handleTranscription: (msg) =>
        set((state) => {
          const segment: TranscriptionSegment = {
            id: msg.id || generateId("tr"),
            text: msg.text,
            confidence: msg.confidence,
            speaker: msg.speaker,
            timestamp: msg.timestamp,
            audioFile: msg.audioFile || null,
            matchedItemId: msg.matchedItemId || null,
            matchedItemName: msg.matchedItemName || null,
          };

          const updated = [segment, ...state.transcriptions];
          if (updated.length > MAX_TRANSCRIPT_HISTORY) {
            updated.length = MAX_TRANSCRIPT_HISTORY;
          }

          return { transcriptions: updated };
        }),

      // ── Alert ────────────────────────────────────────────

      handleAlert: (msg) =>
        set((state) => {
          const alert: Alert = {
            id: msg.id || generateId("alert"),
            timestamp: msg.timestamp,
            severity: msg.severity,
            message: msg.message,
            ruleId: msg.ruleId,
            stageId: msg.stageId || null,
            itemId: msg.itemId || null,
            suggestion: msg.suggestion || "",
            acknowledged: false,
          };

          const updated = [alert, ...state.alerts];
          if (updated.length > MAX_ALERT_HISTORY) {
            updated.length = MAX_ALERT_HISTORY;
          }

          return { alerts: updated };
        }),

      // ── Progress ─────────────────────────────────────────

      handleProgressUpdate: (msg) =>
        set({
          progress: {
            overallProgress: msg.overallProgress,
            totalItems: msg.totalItems,
            confirmedItems: msg.confirmedItems,
            failedItems: msg.failedItems,
            pendingItems: msg.pendingItems,
            ambiguousItems: msg.ambiguousItems,
            stages: msg.stages,
          },
        }),

      // ── Audio Level ──────────────────────────────────────

      handleAudioLevel: (msg) =>
        set({
          audioLevel: {
            rms: msg.rms,
            peak: msg.peak,
            isSpeech: msg.isSpeech,
            timestamp: msg.timestamp,
          },
        }),

      // ── Manual Override ──────────────────────────────────

      manualOverride: (itemId, stageId, status, notes) =>
        set((state) => {
          const newStages = state.stages.map((stage) => {
            if (stage.id !== stageId) return stage;

            const newItems = stage.items.map((item) => {
              if (item.id !== itemId) return item;
              return {
                ...item,
                status,
                timestamp: new Date().toISOString(),
                updatedBy: "MANUAL_OVERRIDE" as UpdateSource,
                notes,
              };
            });

            return {
              ...stage,
              items: newItems,
              progress: computeStageProgress(newItems),
              status: deriveStageStatus(newItems) as StageData["status"],
            };
          });

          return { stages: newStages, progress: recalculateProgress(newStages) };
        }),

      // ── Acknowledge Alert ────────────────────────────────

      acknowledgeAlert: (alertId) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === alertId ? { ...a, acknowledged: true } : a
          ),
        })),

      // ── UI ───────────────────────────────────────────────

      setActiveStage: (stageId) => set({ activeStageId: stageId }),
      setSelectedItem: (itemId) => set({ selectedItemId: itemId }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: "plcvs-session" }
  )
);

// ─── Helpers ───────────────────────────────────────────────────

function recalculateProgress(stages: StageData[]): ProgressData {
  let totalItems = 0;
  let confirmedItems = 0;
  let failedItems = 0;
  let pendingItems = 0;
  let ambiguousItems = 0;
  const stageProgress: Record<string, number> = {};

  for (const stage of stages) {
    stageProgress[stage.id] = computeStageProgress(stage.items);
    for (const item of stage.items) {
      totalItems++;
      switch (item.status) {
        case "CONFIRMED":
          confirmedItems++;
          break;
        case "FAILED":
          failedItems++;
          break;
        case "AMBIGUOUS":
          ambiguousItems++;
          break;
        default:
          pendingItems++;
      }
    }
  }

  return {
    overallProgress: totalItems > 0 ? Math.round((confirmedItems / totalItems) * 100) : 0,
    totalItems,
    confirmedItems,
    failedItems,
    pendingItems,
    ambiguousItems,
    stages: stageProgress,
  };
}
