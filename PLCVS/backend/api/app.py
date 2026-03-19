# app.py
"""
FastAPI application - Main entry point for PLCVS backend
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from api.websocket_handler import WebSocketManager
from datetime import datetime

logger = logging.getLogger(__name__)

# Global instances
ws_manager = WebSocketManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager"""
    logger.info("=== PLCVS Starting Up ===")

    # ── Resolve config paths from environment (set by main.py) ──
    project_root = Path(__file__).parent.parent.parent
    system_config_path = os.environ.get(
        "PLCVS_SYSTEM_CONFIG_PATH",
        str(project_root / "config" / "system_config.yaml"),
    )
    checklist_config_path = os.environ.get(
        "PLCVS_CHECKLIST_CONFIG_PATH",
        str(project_root / "config" / "checklist_config.yaml"),
    )
    vocabulary_path = os.environ.get(
        "PLCVS_VOCABULARY_PATH",
        str(project_root / "config" / "vocabulary" / "military_terms.yaml"),
    )

    # ── Load system config ──
    import yaml
    system_config: dict = {}
    if Path(system_config_path).exists():
        with open(system_config_path, "r") as f:
            system_config = yaml.safe_load(f) or {}

    # ── Load heavy ML models ──
    from stt_engine.whisper_model import WhisperSTT
    from nlp_engine.semantic_matcher import SemanticMatcher
    from nlp_engine.intent_classifier import IntentClassifier
    from checklist.config_loader import load_checklist_config
    from session.session_controller import SessionController
    from session.database import Database

    stt_config = system_config.get("stt", {})
    nlp_config = system_config.get("nlp", {})

    # Initialize STT
    app.state.stt = WhisperSTT(
        model_size=stt_config.get("model_size", "large-v3-turbo"),
        device=stt_config.get("device", "auto"),
    )
    app.state.stt.load_model()

    # Initialize NLP semantic matcher
    app.state.semantic_matcher = SemanticMatcher(
        model_path=nlp_config.get(
            "semantic_model", "sentence-transformers/all-MiniLM-L6-v2"
        ),
        confidence_threshold=nlp_config.get("confidence_threshold", 0.65),
    )
    app.state.semantic_matcher.load_model()

    # Load checklist config
    app.state.checklist_config = load_checklist_config(checklist_config_path)

    # Register checklist items with semantic matcher (expects raw dict)
    app.state.semantic_matcher.register_checklist_items(
        app.state.checklist_config.raw_config
    )

    # Initialize intent classifier
    app.state.intent_classifier = IntentClassifier(
        semantic_matcher=app.state.semantic_matcher
    )

    # ── Database ──
    db_config = system_config.get("database", {})
    db_path = db_config.get("path", "data/plcvs.db")
    resolved_db_path = str(Path(__file__).parent.parent / db_path)
    app.state.database = Database(db_path=resolved_db_path)
    await app.state.database.connect()

    # ── Session Controller ──
    controller = SessionController(system_config)
    await controller.setup(
        checklist_config_path=checklist_config_path,
        stt_model=app.state.stt,
        semantic_matcher=app.state.semantic_matcher,
        vocabulary_path=vocabulary_path,
    )

    # ────────────────────────────────────────────────────────
    # FIX: Wire WebSocket broadcast callbacks with CORRECT
    #      camelCase field names matching the frontend types.
    #
    # The frontend Zustand store expects exact field names:
    #   - WSTranscriptionMessage: id, text, confidence, speaker,
    #     audioFile, matchedItemId, matchedItemName
    #   - WSChecklistUpdateMessage: itemId, stageId, status,
    #     confidence, matchedText, source
    #   - WSAlertMessage: id, severity, message, ruleId,
    #     stageId, itemId, suggestion
    #   - WSProgressMessage: overallProgress, stages,
    #     totalItems, confirmedItems, failedItems,
    #     pendingItems, ambiguousItems
    # ────────────────────────────────────────────────────────

    async def on_transcription(transcription):
        """Broadcast transcription with frontend-compatible field names."""
        logger.info(
            f"[CB] Broadcasting TRANSCRIPTION: "
            f"'{transcription.processed_text[:50]}...'"
        )
        await ws_manager.broadcast({
            "type": "TRANSCRIPTION",
            "id": getattr(transcription, "segment_id", "") or f"tr_{id(transcription)}",
            "text": transcription.processed_text,
            "confidence": transcription.confidence,
            "speaker": transcription.speaker_turn,
            "timestamp": datetime.now().isoformat(),
            "audioFile": getattr(transcription, "audio_file", None),
            "matchedItemId": None,
            "matchedItemName": None,
        })

    async def on_checklist_update(match):
        """Broadcast checklist update with frontend-compatible field names."""
        logger.info(
            f"[CB] Broadcasting CHECKLIST_UPDATE: "
            f"item={match.checklist_item_id}, "
            f"stage={match.stage_id}, "
            f"status={match.intent}, "
            f"conf={match.confidence:.2%}"
        )

        # Map the match intent to the status the frontend expects
        status = match.intent
        if status == "QUESTION":
            status = "IN_PROGRESS"
        elif status == "NO_MATCH":
            return  # Don't broadcast no-match

        await ws_manager.broadcast({
            "type": "CHECKLIST_UPDATE",
            "itemId": match.checklist_item_id,       # ← camelCase
            "stageId": match.stage_id or "",          # ← camelCase
            "status": status,
            "confidence": match.confidence,
            "matchedText": match.transcribed_text,    # ← camelCase
            "source": "AUTO",
            "timestamp": datetime.now().isoformat(),
        })

    async def on_alert(alert):
        """Broadcast alert with frontend-compatible field names."""
        logger.info(
            f"[CB] Broadcasting ALERT: "
            f"[{alert.severity.value}] {alert.message[:60]}"
        )
        await ws_manager.broadcast({
            "type": "ALERT",
            "id": alert.id,
            "severity": alert.severity.value,
            "message": alert.message,
            "ruleId": alert.rule_id,                  # ← camelCase
            "stageId": alert.stage_id,                # ← camelCase
            "itemId": alert.item_id,                  # ← camelCase
            "suggestion": getattr(alert, "suggestion", ""),
            "timestamp": alert.timestamp.isoformat() if hasattr(alert.timestamp, 'isoformat') else str(alert.timestamp),
        })

    async def on_progress(progress):
        """Broadcast progress with frontend-compatible field names."""
        logger.info(
            f"[CB] Broadcasting PROGRESS_UPDATE: "
            f"{progress.overall_progress:.1f}%"
        )

        # Convert stage_details to the format frontend expects:
        # { stageId: progressPercent }
        stage_progress = {}
        if hasattr(progress, "stage_details"):
            for sd in progress.stage_details:
                stage_id = sd.get("stage_id") if isinstance(sd, dict) else getattr(sd, "stage_id", "")
                prog = sd.get("progress", 0) if isinstance(sd, dict) else getattr(sd, "progress", 0)
                stage_progress[stage_id] = prog

        await ws_manager.broadcast({
            "type": "PROGRESS_UPDATE",
            "overallProgress": progress.overall_progress,    # ← camelCase
            "stages": stage_progress,
            "totalItems": progress.total_items,              # ← camelCase
            "confirmedItems": progress.confirmed_items,      # ← camelCase
            "failedItems": progress.failed_items,            # ← camelCase
            "pendingItems": progress.pending_items,          # ← camelCase
            "ambiguousItems": progress.ambiguous_items,      # ← camelCase
            "timestamp": datetime.now().isoformat(),
        })

    controller.set_callbacks(
        on_transcription=on_transcription,
        on_checklist_update=on_checklist_update,
        on_alert=on_alert,
        on_progress=on_progress,
    )

    app.state.session_controller = controller

    logger.info("=== All Models Loaded. PLCVS Ready ===")

    yield

    # ── Shutdown ──
    logger.info("=== PLCVS Shutting Down ===")
    if app.state.session_controller and app.state.session_controller.is_active:
        await app.state.session_controller.stop_session()
    await app.state.database.disconnect()
    logger.info("=== PLCVS Shutdown Complete ===")


app = FastAPI(
    title="PLCVS - Pre-Launch Checklist Verification System",
    version="1.0.0",
    description="DRDO Missile Pre-Launch Checklist Verification System",
    lifespan=lifespan,
)

# CORS (for local Electron app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST routes
app.include_router(router, prefix="/api/v1")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time UI updates"""
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming commands from UI
            await ws_manager.handle_message(data, websocket, app)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("WebSocket client disconnected")