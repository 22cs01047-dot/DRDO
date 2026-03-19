/**
 * PLCVS Frontend Type Definitions
 */

// ─── Enums / Literal Types ─────────────────────────────────────

export type ItemStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "CONFIRMED"
  | "FAILED"
  | "AMBIGUOUS";


export type StageStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "CONFIRMED"
  | "FAILED";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type DependencyType = "STRICT" | "SOFT" | "PARALLEL" | "INDEPENDENT";

export type UpdateSource = "AUTO" | "MANUAL_OVERRIDE";

export type SpeakerTurn = "QUESTIONER" | "RESPONDER" | "UNKNOWN";

export type SessionStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "ABORTED";

// ─── Checklist Item ────────────────────────────────────────────

export interface ChecklistItemData {
  id: string;
  name: string;
  status: ItemStatus;
  confidence: number;
  matchedText: string;
  timestamp: string | null;
  updatedBy: UpdateSource;
  mandatory: boolean;
  orderInStage: number;
  audioSegmentId: string | null;
  notes: string;
}

// ─── Stage ─────────────────────────────────────────────────────

export interface StageData {
  id: string;
  name: string;
  order: number;
  status: StageStatus;
  dependencyType: DependencyType;
  dependsOn: string | null;
  progress: number;
  items: ChecklistItemData[];
}

// ─── Transcription ─────────────────────────────────────────────

export interface TranscriptionSegment {
  id: string;
  text: string;
  confidence: number;
  speaker: SpeakerTurn;
  timestamp: string;
  audioFile: string | null;
  matchedItemId: string | null;
  matchedItemName: string | null;
}

// ─── Alert ─────────────────────────────────────────────────────

export interface Alert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  message: string;
  ruleId: string;
  stageId: string | null;
  itemId: string | null;
  suggestion: string;
  acknowledged: boolean;
}

// ─── Progress ──────────────────────────────────────────────────

export interface ProgressData {
  overallProgress: number;
  totalItems: number;
  confirmedItems: number;
  failedItems: number;
  pendingItems: number;
  ambiguousItems: number;
  stages: Record<string, number>; // stageId → progress %
}

// ─── Session ───────────────────────────────────────────────────

export interface SessionInfo {
  sessionId: string;
  missionId: string;
  missionName: string;
  status: SessionStatus;
  startTime: string | null;
  endTime: string | null;
  operatorName: string;
}

// ─── Audio Monitor ─────────────────────────────────────────────

export interface AudioLevel {
  rms: number;        // 0.0 – 1.0
  peak: number;       // 0.0 – 1.0
  isSpeech: boolean;
  timestamp: string;
}

// ─── WebSocket Messages ────────────────────────────────────────

export type WSMessageType =
  | "SESSION_STARTED"
  | "SESSION_STOPPED"
  | "SESSION_PAUSED"
  | "SESSION_RESUMED"
  | "TRANSCRIPTION"
  | "CHECKLIST_UPDATE"
  | "ALERT"
  | "PROGRESS_UPDATE"
  | "AUDIO_LEVEL"
  | "STAGE_UPDATE"
  | "ERROR"
  | "PONG"
  | "SYSTEM_STATUS";

export interface WSMessage {
  type: WSMessageType;
  timestamp: string;
  [key: string]: unknown;
}

export interface WSTranscriptionMessage extends WSMessage {
  type: "TRANSCRIPTION";
  id: string;
  text: string;
  confidence: number;
  speaker: SpeakerTurn;
  audioFile: string | null;
  matchedItemId: string | null;
  matchedItemName: string | null;
}

export interface WSChecklistUpdateMessage extends WSMessage {
  type: "CHECKLIST_UPDATE";
  itemId: string;
  stageId: string;
  status: ItemStatus;
  confidence: number;
  matchedText: string;
  source: UpdateSource;
}

export interface WSAlertMessage extends WSMessage {
  type: "ALERT";
  id: string;
  severity: AlertSeverity;
  message: string;
  ruleId: string;
  stageId: string | null;
  itemId: string | null;
  suggestion: string;
}

export interface WSProgressMessage extends WSMessage {
  type: "PROGRESS_UPDATE";
  overallProgress: number;
  stages: Record<string, number>;
  totalItems: number;
  confirmedItems: number;
  failedItems: number;
  pendingItems: number;
  ambiguousItems: number;
}

export interface WSAudioLevelMessage extends WSMessage {
  type: "AUDIO_LEVEL";
  rms: number;
  peak: number;
  isSpeech: boolean;
}

export interface WSSystemStatusMessage extends WSMessage {
  type: "SYSTEM_STATUS";
  sttReady: boolean;
  nlpReady: boolean;
  audioReady: boolean;
  modelsLoaded: boolean;
}

// ─── Outgoing Commands (UI → Backend) ──────────────────────────

export type WSCommandType =
  | "START_SESSION"
  | "STOP_SESSION"
  | "PAUSE_SESSION"
  | "RESUME_SESSION"
  | "MANUAL_OVERRIDE"
  | "ACKNOWLEDGE_ALERT"
  | "REPLAY_AUDIO"
  | "PING";

export interface WSCommand {
  type: WSCommandType;
  [key: string]: unknown;
}

export interface WSManualOverrideCommand extends WSCommand {
  type: "MANUAL_OVERRIDE";
  itemId: string;
  stageId: string;
  status: ItemStatus;
  notes: string;
}

export interface WSStartSessionCommand extends WSCommand {
  type: "START_SESSION";
  sessionId: string;
  missionId: string;
  operatorName: string;
}

// ─── Configuration Types ───────────────────────────────────────

export interface ChecklistConfig {
  mission: {
    id: string;
    name: string;
    version: string;
  };
  stages: StageConfig[];
}

export interface StageConfig {
  id: string;
  name: string;
  order: number;
  dependency: string | null;
  type: DependencyType;
  checklist_items: ChecklistItemConfig[];
}

export interface ChecklistItemConfig {
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

// ─── Session Report ────────────────────────────────────────────

export interface SessionReport {
  session: SessionInfo;
  progress: ProgressData;
  stages: StageData[];
  transcriptions: TranscriptionSegment[];
  alerts: Alert[];
  timeline: TimelineEvent[];
  summary: {
    totalDuration: string;
    totalTranscriptions: number;
    totalAlerts: number;
    criticalAlerts: number;
    manualOverrides: number;
    averageConfidence: number;
  };
}

export interface TimelineEvent {
  timestamp: string;
  type: "CHECKLIST" | "ALERT" | "TRANSCRIPTION" | "SESSION";
  description: string;
  severity?: AlertSeverity;
  itemId?: string;
  stageId?: string;
}
