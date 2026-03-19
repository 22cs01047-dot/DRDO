/**
 * Audio API — device listing and file transcription.
 */

import { apiClient } from "./client";
import type { DeviceListResponse, TranscribeFileResponse } from "./types";

/**
 * GET /api/v1/devices
 * List available audio input devices on the server.
 */
export async function getAudioDevices(
  signal?: AbortSignal
): Promise<DeviceListResponse> {
  return apiClient.get<DeviceListResponse>("/devices", undefined, signal);
}

/**
 * POST /api/v1/transcribe/file
 * Upload and transcribe an audio file (WAV).
 */
export async function transcribeFile(
  file: File,
  signal?: AbortSignal
): Promise<TranscribeFileResponse> {
  return apiClient.upload<TranscribeFileResponse>("/transcribe/file", file, "file", signal);
}
