/**
 * Session API — start, stop, progress, state, alerts, override, history.
 */

import { apiClient } from "./client";
import type {
  SessionStartRequest,
  SessionResponse,
  ProgressResponse,
  ChecklistSnapshotResponse,
  AlertListResponse,
  ManualOverrideRequest,
  ManualOverrideResponse,
  SessionHistoryResponse,
} from "./types";

/**
 * POST /api/v1/session/start
 * Start a new verification session.
 */
export async function startSession(
  body?: SessionStartRequest,
  signal?: AbortSignal
): Promise<SessionResponse> {
  return apiClient.post<SessionResponse>("/session/start", body ?? {}, signal);
}

/**
 * POST /api/v1/session/stop
 * Stop the active session and get a report.
 */
export async function stopSession(
  signal?: AbortSignal
): Promise<SessionResponse> {
  return apiClient.post<SessionResponse>("/session/stop", undefined, signal);
}

/**
 * POST /api/v1/session/pause
 * Pause the active session (stops audio capture, keeps session alive).
 */
export async function pauseSession(
  signal?: AbortSignal
): Promise<SessionResponse> {
  return apiClient.post<SessionResponse>("/session/pause", undefined, signal);
}

/**
 * POST /api/v1/session/resume
 * Resume a paused session.
 */
export async function resumeSession(
  signal?: AbortSignal
): Promise<SessionResponse> {
  return apiClient.post<SessionResponse>("/session/resume", undefined, signal);
}

/**
 * GET /api/v1/session/progress
 * Get current session progress metrics.
 */
export async function getSessionProgress(
  signal?: AbortSignal
): Promise<ProgressResponse> {
  return apiClient.get<ProgressResponse>("/session/progress", undefined, signal);
}

/**
 * GET /api/v1/session/state
 * Get complete session state snapshot (same shape as checklist/snapshot).
 */
export async function getSessionState(
  signal?: AbortSignal
): Promise<ChecklistSnapshotResponse> {
  return apiClient.get<ChecklistSnapshotResponse>("/session/state", undefined, signal);
}

/**
 * GET /api/v1/session/alerts
 * Get session alerts, optionally filtered by severity.
 */
export async function getSessionAlerts(
  params?: { severity?: string; limit?: number },
  signal?: AbortSignal
): Promise<AlertListResponse> {
  return apiClient.get<AlertListResponse>("/session/alerts", params, signal);
}

/**
 * POST /api/v1/session/override
 * Manually override a checklist item status.
 */
export async function manualOverride(
  body: ManualOverrideRequest,
  signal?: AbortSignal
): Promise<ManualOverrideResponse> {
  return apiClient.post<ManualOverrideResponse>("/session/override", body, signal);
}

/**
 * GET /api/v1/sessions/history
 * Fetch past session records.
 */
export async function getSessionHistory(
  limit = 20,
  signal?: AbortSignal
): Promise<SessionHistoryResponse> {
  return apiClient.get<SessionHistoryResponse>("/sessions/history", { limit }, signal);
}
