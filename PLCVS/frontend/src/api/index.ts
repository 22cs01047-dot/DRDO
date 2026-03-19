/**
 * PLCVS API — barrel export.
 *
 * Usage:
 *   import { getHealth, getChecklistConfig, startSession, apiClient } from "@/api";
 */

// Base client
export { apiClient, PlcvsApiError } from "./client";

// Health
export { getHealth } from "./health";

// Checklist
export { getChecklistConfig, getChecklistSnapshot } from "./checklist";

// Session
export {
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  getSessionProgress,
  getSessionState,
  getSessionAlerts,
  manualOverride,
  getSessionHistory,
} from "./session";

// Audio
export { getAudioDevices, transcribeFile } from "./audio";

// WebSocket service
export { WebSocketService, wsService } from "./websocket";

// Types (re-export all)
export type * from "./types";
