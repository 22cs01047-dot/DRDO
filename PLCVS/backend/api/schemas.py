"""
Pydantic schemas for API request/response validation.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "healthy"
    version: str = "1.0.0"
    models_loaded: dict
    uptime_seconds: float


class SessionStartRequest(BaseModel):
    mission_config: Optional[str] = None
    audio_device_index: Optional[int] = None


class SessionResponse(BaseModel):
    session_id: str
    status: str
    message: str = ""
    data: Optional[Dict[str, Any]] = None


class ManualOverrideRequest(BaseModel):
    item_id: str
    status: str = Field(
        ...,
        description="CONFIRMED | FAILED | PENDING | SKIPPED",
    )


class ItemStatusResponse(BaseModel):
    item_id: str
    item_name: str
    stage_id: str
    status: str
    confidence: float
    matched_text: str
    updated_by: str
    updated_at: Optional[str]


class StageStatusResponse(BaseModel):
    stage_id: str
    stage_name: str
    order: int
    status: str
    progress: float
    items: List[ItemStatusResponse]


class ProgressResponse(BaseModel):
    overall_progress: float
    total_items: int
    confirmed_items: int
    failed_items: int
    pending_items: int
    ambiguous_items: int
    stages_complete: int
    stages_total: int
    stages_failed: int
    is_launch_ready: bool
    stage_details: List[Dict[str, Any]]


class AlertResponse(BaseModel):
    id: str
    timestamp: str
    severity: str
    rule_id: str
    message: str
    stage_id: Optional[str] = None
    item_id: Optional[str] = None
    suggestion: str = ""
    acknowledged: bool = False


class AlertListResponse(BaseModel):
    """List of alerts — used by GET /session/alerts."""
    alerts: List[Dict[str, Any]]


class SessionHistoryRecord(BaseModel):
    """A single past session record."""
    session_id: str
    mission_id: str
    status: str
    start_time: str
    end_time: Optional[str] = None
    overall_progress: float = 0.0


class SessionStatusResponse(BaseModel):
    session: dict
    progress: dict
    audio: dict
    alerts: dict


class ChecklistSnapshotResponse(BaseModel):
    overall_progress: float
    stages: Dict


class TranscribeFileRequest(BaseModel):
    language: str = "en"


class DeviceListResponse(BaseModel):
    devices: List[Dict[str, Any]]


class AudioFileRequest(BaseModel):
    file_path: str = Field(..., description="Path to audio file")
    realtime: bool = Field(
        default=False,
        description="Simulate real-time processing",
    )
