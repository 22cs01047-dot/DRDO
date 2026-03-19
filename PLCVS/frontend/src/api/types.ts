/**
 * TypeScript types for all PLCVS backend API request/response schemas.
 * Mirrors backend/api/schemas.py exactly.
 */

// ─── Common ────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status: number;
}

// ─── GET /health ───────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
  models_loaded: {
    stt: boolean;
    semantic: boolean;
  };
  uptime_seconds: number;
}

// ─── GET /checklist/config ─────────────────────────────────────

export interface ChecklistConfigResponse {
  mission: {
    id: string;
    name: string;
    version: string;
  };
  stages: StageConfigDTO[];
  rules?: RuleDTO[];
}

export interface StageConfigDTO {
  id: string;
  name: string;
  order: number;
  dependency: string | null;
  type: "STRICT" | "SOFT" | "PARALLEL" | "INDEPENDENT";
  checklist_items: ChecklistItemConfigDTO[];
}

export interface ChecklistItemConfigDTO {
  id: string;
  name: string;
  keywords: string[];
  expected_responses: {
    positive: string[];
    negative: string[];
  };
  mandatory: boolean;
  order_in_stage: number;
}

export interface RuleDTO {
  id: string;
  description: string;
  type: string;
  severity: string;
}

// ─── GET /checklist/snapshot ───────────────────────────────────

export interface ChecklistSnapshotResponse {
  stages: Record<string, StageSnapshotDTO>;
  timestamp: string;
}

export interface StageSnapshotDTO {
  stage_id: string;
  stage_name: string;
  order: number;
  status: string;
  progress: number;
  items: Record<string, ItemSnapshotDTO>;
}

export interface ItemSnapshotDTO {
  item_id: string;
  item_name: string;
  status: string;
  confidence: number;
  matched_text: string;
  updated_at: string | null;
  updated_by: string;
}

// ─── POST /session/start ──────────────────────────────────────

export interface SessionStartRequest {
  mission_config?: string | null;
  audio_device_index?: number | null;
}

export interface SessionResponse {
  session_id: string;
  status: string;
  message: string;
  data?: Record<string, unknown> | null;
}

// ─── POST /session/stop ───────────────────────────────────────
// Uses SessionResponse (same schema)

// ─── GET /session/progress ────────────────────────────────────

export interface ProgressResponse {
  overall_progress: number;
  total_items: number;
  confirmed_items: number;
  failed_items: number;
  pending_items: number;
  ambiguous_items: number;
  stages_complete: number;
  stages_total: number;
  stages_failed: number;
  is_launch_ready: boolean;
  stage_details: StageDetailDTO[];
}

export interface StageDetailDTO {
  stage_id: string;
  stage_name: string;
  status: string;
  progress: number;
  items_confirmed: number;
  items_total: number;
}

// ─── GET /session/state ───────────────────────────────────────
// Returns same as ChecklistSnapshotResponse

// ─── GET /session/alerts ──────────────────────────────────────

export interface AlertListResponse {
  alerts: AlertDTO[];
}

export interface AlertDTO {
  id: string;
  timestamp: string;
  severity: string;
  rule_id: string;
  message: string;
  stage_id: string | null;
  item_id: string | null;
  suggestion?: string;
  acknowledged: boolean;
}

// ─── POST /session/override ───────────────────────────────────

export interface ManualOverrideRequest {
  item_id: string;
  status: string; // CONFIRMED | FAILED | PENDING | SKIPPED
}

export interface ManualOverrideResponse {
  status: string;
  item_id: string;
  new_status: string;
}

// ─── GET /devices ─────────────────────────────────────────────

export interface DeviceListResponse {
  devices: AudioDeviceDTO[];
}

export interface AudioDeviceDTO {
  index: number;
  name: string;
  max_input_channels: number;
  default_sample_rate: number;
  is_default: boolean;
  [key: string]: unknown;
}

// ─── POST /transcribe/file ────────────────────────────────────

export interface TranscribeFileResponse {
  text: string;
  confidence: number;
  language: string;
  duration: number;
  segments: TranscribeSegmentDTO[];
}

export interface TranscribeSegmentDTO {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

// ─── GET /sessions/history ────────────────────────────────────

export interface SessionHistoryResponse {
  sessions: SessionHistoryRecord[];
}

export interface SessionHistoryRecord {
  session_id: string;
  mission_id: string;
  mission_name?: string;
  status: string;
  start_time: string;
  end_time: string | null;
  overall_progress: number;
  config_snapshot?: string;
  created_at?: string;
}
