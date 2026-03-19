/**
 * Health check API — GET /api/v1/health
 */

import { apiClient } from "./client";
import type { HealthResponse } from "./types";

/**
 * Fetch system health status (model loading, uptime).
 */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiClient.get<HealthResponse>("/health", undefined, signal);
}
