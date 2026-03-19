/**
 * Checklist API — config and live snapshot endpoints.
 */

import { apiClient } from "./client";
import type { ChecklistConfigResponse, ChecklistSnapshotResponse } from "./types";

/**
 * GET /api/v1/checklist/config
 * Returns the full mission checklist configuration (stages, items, keywords, rules).
 */
export async function getChecklistConfig(
  signal?: AbortSignal
): Promise<ChecklistConfigResponse> {
  return apiClient.get<ChecklistConfigResponse>("/checklist/config", undefined, signal);
}

/**
 * GET /api/v1/checklist/snapshot
 * Returns the current live state of all checklist items and stages.
 * Requires an active session.
 */
export async function getChecklistSnapshot(
  signal?: AbortSignal
): Promise<ChecklistSnapshotResponse> {
  return apiClient.get<ChecklistSnapshotResponse>("/checklist/snapshot", undefined, signal);
}
