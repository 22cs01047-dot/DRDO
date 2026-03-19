# routes.py
"""
REST API Routes for PLCVS.
"""

import logging
import time
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import JSONResponse

from api.schemas import (
    SessionStartRequest,
    SessionResponse,
    ManualOverrideRequest,
    ProgressResponse,
    AlertListResponse,
    TranscribeFileRequest,
    DeviceListResponse,
    HealthResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Module-level start time (set when module is first imported at server boot)
_start_time: float = time.time()


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request):
    """System health check endpoint."""
    app = request.app
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        models_loaded={
            "stt": (
                app.state.stt.is_loaded()
                if hasattr(app.state, "stt")
                else False
            ),
            "semantic": (
                hasattr(app.state, "semantic_matcher")
            ),
        },
        uptime_seconds=round(time.time() - _start_time, 2),
    )



@router.get("/checklist/config")
async def get_checklist_config(request: Request):
    """Get current checklist configuration."""
    config = getattr(request.app.state, "checklist_config", None)
    if config:
        return config.raw_config
    raise HTTPException(404, "No checklist config loaded")

@router.get("/checklist/snapshot")
async def get_checklist_snapshot(request: Request):
    """Get current checklist state snapshot."""
    controller = getattr(request.app.state, "session_controller", None)
    if controller and controller.state_manager:
        return controller.state_manager.get_snapshot()
    raise HTTPException(404, "No active session")


@router.get("/devices", response_model=DeviceListResponse)
async def list_audio_devices():
    """List available audio input devices."""
    from audio_capture.audio_stream import AudioStream

    stream = AudioStream()
    try:
        devices = stream.list_devices()
    finally:
        stream.cleanup()

    return DeviceListResponse(devices=devices)


@router.post("/session/start", response_model=SessionResponse)
async def start_session(
    body: SessionStartRequest, request: Request
):
    """Start a new verification session."""
    controller = getattr(request.app.state, "session_controller", None)
    if controller is None:
        raise HTTPException(503, "Session controller not initialized")

    if controller.is_active:
        raise HTTPException(409, "A session is already active")

    try:
        session_id = await controller.start_session()
        return SessionResponse(
            session_id=session_id,
            status="ACTIVE",
            message="Session started successfully",
        )
    except Exception as e:
        logger.error(f"Failed to start session: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to start session: {str(e)}")


@router.post("/session/stop", response_model=SessionResponse)
async def stop_session(request: Request):
    """Stop the active session."""
    controller = getattr(request.app.state, "session_controller", None)

    if not controller or not controller.is_active:
        raise HTTPException(404, "No active session")

    try:
        result = await controller.stop_session()
        return SessionResponse(
            session_id=result.get("session_id", ""),
            status="COMPLETED",
            message="Session stopped",
            data=result,
        )
    except Exception as e:
        logger.error(f"Failed to stop session: {e}")
        raise HTTPException(500, f"Failed to stop session: {str(e)}")


@router.post("/session/pause", response_model=SessionResponse)
async def pause_session(request: Request):
    """Pause the active session (stops audio capture, keeps session alive)."""
    controller = getattr(request.app.state, "session_controller", None)

    if not controller or not controller.is_active:
        raise HTTPException(404, "No active session")

    if controller.is_paused:
        raise HTTPException(409, "Session is already paused")

    try:
        result = await controller.pause_session()
        return SessionResponse(
            session_id=result.get("session_id", ""),
            status="PAUSED",
            message="Session paused",
        )
    except Exception as e:
        logger.error(f"Failed to pause session: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to pause session: {str(e)}")


@router.post("/session/resume", response_model=SessionResponse)
async def resume_session(request: Request):
    """Resume a paused session."""
    controller = getattr(request.app.state, "session_controller", None)

    if not controller or not controller.is_active:
        raise HTTPException(404, "No active session")

    if not controller.is_paused:
        raise HTTPException(409, "Session is not paused")

    try:
        result = await controller.resume_session()
        return SessionResponse(
            session_id=result.get("session_id", ""),
            status="ACTIVE",
            message="Session resumed",
        )
    except Exception as e:
        logger.error(f"Failed to resume session: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to resume session: {str(e)}")


@router.get("/session/progress", response_model=ProgressResponse)
async def get_progress(request: Request):
    """Get current session progress."""
    controller = getattr(request.app.state, "session_controller", None)

    if not controller or not controller.progress_tracker:
        raise HTTPException(404, "No active session")

    progress = controller.progress_tracker.get_progress()
    return ProgressResponse(**progress.__dict__)


@router.get("/session/state")
async def get_session_state(request: Request):
    """Get complete session state snapshot."""
    controller = getattr(request.app.state, "session_controller", None)

    if not controller or not controller.state_manager:
        raise HTTPException(404, "No active session")

    return controller.state_manager.get_snapshot()


@router.get("/session/alerts", response_model=AlertListResponse)
async def get_alerts(
    request: Request,
    severity: Optional[str] = None,
    limit: int = 50,
):
    """Get session alerts."""
    controller = getattr(request.app.state, "session_controller", None)

    if not controller or not controller.alert_generator:
        raise HTTPException(404, "No active session")

    from rules_engine.alert_generator import AlertSeverity

    sev = AlertSeverity(severity) if severity else None
    alerts = controller.alert_generator.get_alerts(severity=sev, limit=limit)

    return AlertListResponse(alerts=[
        {
            "id": a.id,
            "timestamp": a.timestamp.isoformat(),
            "severity": a.severity.value,
            "rule_id": a.rule_id,
            "message": a.message,
            "stage_id": a.stage_id,
            "item_id": a.item_id,
            "acknowledged": a.acknowledged,
        }
        for a in alerts
    ])


@router.post("/session/override")
async def manual_override(
    body: ManualOverrideRequest, request: Request
):
    """Manually override a checklist item status."""
    controller = getattr(request.app.state, "session_controller", None)

    if not controller or not controller.is_active:
        raise HTTPException(404, "No active session")

    success = await controller.manual_override(
        item_id=body.item_id,
        status_str=body.status,
    )

    if not success:
        raise HTTPException(400, f"Failed to override item {body.item_id}")

    return {"status": "ok", "item_id": body.item_id, "new_status": body.status}


@router.post("/transcribe/file")
async def transcribe_file(
    request: Request,
    file: UploadFile = File(...),
):
    """Transcribe an uploaded audio file (for testing)."""
    import tempfile
    import os

    stt = request.app.state.stt
    if not stt or not stt.is_loaded():
        raise HTTPException(503, "STT model not loaded")

    # Save uploaded file
    with tempfile.NamedTemporaryFile(
        suffix=".wav", delete=False
    ) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = stt.transcribe(tmp_path)
        return {
            "text": result.text,
            "confidence": result.confidence,
            "language": result.language,
            "duration": result.duration,
            "segments": result.segments,
        }
    finally:
        os.unlink(tmp_path)


@router.get("/sessions/history")
async def session_history(request: Request, limit: int = 20):
    """Get past session records."""
    db = getattr(request.app.state, "database", None)
    if not db:
        return {"sessions": []}

    sessions = await db.get_all_sessions(limit=limit)
    return {"sessions": sessions}
