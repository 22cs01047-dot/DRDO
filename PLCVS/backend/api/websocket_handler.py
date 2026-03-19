# websocket_handler.py
"""
WebSocket manager for real-time communication with frontend.

FIX: Added broadcast logging, dead connection cleanup, and
     connection health tracking.
"""

import json
import asyncio
import logging
from typing import List, Dict, Any
from datetime import datetime

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections and broadcasts"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            f"[WS] Client connected. Active connections: "
            f"{len(self.active_connections)}"
        )

        # Send initial system status so frontend knows we're alive
        await self.send_personal(websocket, {
            "type": "SYSTEM_STATUS",
            "sttReady": True,
            "nlpReady": True,
            "audioReady": True,
            "modelsLoaded": True,
            "timestamp": datetime.now().isoformat(),
        })

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(
            f"[WS] Client disconnected. Active connections: "
            f"{len(self.active_connections)}"
        )

    async def broadcast(self, message: dict):
        """Send message to all connected clients with error handling."""
        if not self.active_connections:
            logger.debug(
                f"[WS] No clients connected. Dropping {message.get('type')} "
                f"message."
            )
            return

        payload = json.dumps(message, default=str)
        disconnected: List[WebSocket] = []

        logger.info(
            f"[WS-BROADCAST] {message.get('type')} → "
            f"{len(self.active_connections)} client(s)"
        )

        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.error(f"[WS-BROADCAST] Send failed: {e}")
                disconnected.append(connection)

        # Remove dead connections
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)
                logger.warning(
                    f"[WS] Removed dead connection. Active: "
                    f"{len(self.active_connections)}"
                )

    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send message to a specific client"""
        try:
            payload = json.dumps(message, default=str)
            await websocket.send_text(payload)
        except Exception as e:
            logger.error(f"[WS] Personal send failed: {e}")

    async def handle_message(self, data: str, websocket: WebSocket, app):
        """Handle incoming WebSocket messages from the UI"""
        try:
            message = json.loads(data)
            msg_type = message.get("type")
            logger.debug(f"[WS] Received: {msg_type}")

            if msg_type == "START_SESSION":
                await self._handle_start_session(message, websocket, app)
            elif msg_type == "STOP_SESSION":
                await self._handle_stop_session(message, websocket, app)
            elif msg_type == "PAUSE_SESSION":
                await self._handle_pause_session(message, websocket, app)
            elif msg_type == "RESUME_SESSION":
                await self._handle_resume_session(message, websocket, app)
            elif msg_type == "MANUAL_OVERRIDE":
                await self._handle_manual_override(message, websocket, app)
            elif msg_type == "PING":
                await self.send_personal(websocket, {
                    "type": "PONG",
                    "timestamp": datetime.now().isoformat(),
                })
            else:
                logger.warning(f"[WS] Unknown message type: {msg_type}")

        except json.JSONDecodeError:
            logger.error(f"[WS] Invalid JSON received: {data[:100]}")

    async def _handle_start_session(self, message, websocket, app):
        controller = getattr(app.state, "session_controller", None)
        if not controller:
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": "Session controller not initialized",
            })
            return

        if controller.is_active:
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": "A session is already active",
            })
            return

        try:
            session_id = await controller.start_session()
            await self.broadcast({
                "type": "SESSION_STARTED",
                "timestamp": datetime.now().isoformat(),
                "session_id": session_id,
            })
        except Exception as e:
            logger.error(f"[WS] start_session error: {e}", exc_info=True)
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": str(e),
            })

    async def _handle_stop_session(self, message, websocket, app):
        controller = getattr(app.state, "session_controller", None)
        if not controller or not controller.is_active:
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": "No active session",
            })
            return

        try:
            result = await controller.stop_session()
            await self.broadcast({
                "type": "SESSION_STOPPED",
                "timestamp": datetime.now().isoformat(),
                "result": result,
            })
        except Exception as e:
            logger.error(f"[WS] stop_session error: {e}", exc_info=True)
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": str(e),
            })

    async def _handle_pause_session(self, message, websocket, app):
        controller = getattr(app.state, "session_controller", None)
        if not controller or not controller.is_active:
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": "No active session",
            })
            return

        if controller.is_paused:
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": "Session is already paused",
            })
            return

        try:
            result = await controller.pause_session()
            await self.broadcast({
                "type": "SESSION_PAUSED",
                "timestamp": datetime.now().isoformat(),
                "session_id": result.get("session_id", ""),
            })
        except Exception as e:
            logger.error(f"[WS] pause_session error: {e}", exc_info=True)
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": str(e),
            })

    async def _handle_resume_session(self, message, websocket, app):
        controller = getattr(app.state, "session_controller", None)
        if not controller or not controller.is_active:
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": "No active session",
            })
            return

        if not controller.is_paused:
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": "Session is not paused",
            })
            return

        try:
            result = await controller.resume_session()
            await self.broadcast({
                "type": "SESSION_RESUMED",
                "timestamp": datetime.now().isoformat(),
                "session_id": result.get("session_id", ""),
            })
        except Exception as e:
            logger.error(f"[WS] resume_session error: {e}", exc_info=True)
            await self.send_personal(websocket, {
                "type": "ERROR",
                "message": str(e),
            })

    async def _handle_manual_override(self, message, websocket, app):
        controller = getattr(app.state, "session_controller", None)
        item_id = message.get("item_id")
        new_status = message.get("status")
        logger.info(f"[WS] Manual override: {item_id} -> {new_status}")

        if controller and controller.is_active:
            success = await controller.manual_override(
                item_id=item_id,
                status_str=new_status,
            )
            if not success:
                await self.send_personal(websocket, {
                    "type": "ERROR",
                    "message": f"Override failed for {item_id}",
                })
                return

        await self.broadcast({
            "type": "CHECKLIST_UPDATE",
            "itemId": item_id,
            "stageId": "",
            "status": new_status,
            "confidence": 1.0,
            "matchedText": "MANUAL OVERRIDE",
            "source": "MANUAL_OVERRIDE",
            "timestamp": datetime.now().isoformat(),
        })

    # ── Broadcast helpers for the processing pipeline ──────

    async def broadcast_transcription(
        self, text: str, confidence: float, speaker: str
    ):
        """Broadcast new transcription to UI."""
        await self.broadcast({
            "type": "TRANSCRIPTION",
            "id": f"tr_{datetime.now().strftime('%H%M%S')}_{id(text) % 10000}",
            "text": text,
            "confidence": confidence,
            "speaker": speaker,
            "timestamp": datetime.now().isoformat(),
            "audioFile": None,
            "matchedItemId": None,
            "matchedItemName": None,
        })

    async def broadcast_checklist_update(
        self,
        item_id: str,
        stage_id: str,
        status: str,
        confidence: float,
        matched_text: str,
    ):
        """Broadcast checklist item status change."""
        await self.broadcast({
            "type": "CHECKLIST_UPDATE",
            "itemId": item_id,
            "stageId": stage_id,
            "status": status,
            "confidence": confidence,
            "matchedText": matched_text,
            "source": "AUTO",
            "timestamp": datetime.now().isoformat(),
        })

    async def broadcast_alert(
        self,
        severity: str,
        message: str,
        rule_id: str,
        stage_id: str = None,
        item_id: str = None,
    ):
        """Broadcast alert to UI."""
        await self.broadcast({
            "type": "ALERT",
            "id": f"alert_{datetime.now().strftime('%H%M%S')}_{id(message) % 10000}",
            "severity": severity,
            "message": message,
            "ruleId": rule_id,
            "stageId": stage_id,
            "itemId": item_id,
            "suggestion": "",
            "timestamp": datetime.now().isoformat(),
        })

    async def broadcast_progress(self, overall: float, stages: dict):
        """Broadcast progress update."""
        # Convert stage details to the format frontend expects
        stage_percentages = {}
        for key, val in stages.items():
            if isinstance(val, dict):
                stage_percentages[key] = val.get("progress", 0)
            else:
                stage_percentages[key] = val

        await self.broadcast({
            "type": "PROGRESS_UPDATE",
            "overallProgress": overall,
            "stages": stage_percentages,
            "totalItems": 0,
            "confirmedItems": 0,
            "failedItems": 0,
            "pendingItems": 0,
            "ambiguousItems": 0,
            "timestamp": datetime.now().isoformat(),
        })