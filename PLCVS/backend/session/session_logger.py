# session_logger.py
"""
Session Logger

Logs all session events for audit trail and post-operation review.
"""

import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class SessionLogger:
    """
    Structured logging for session events.

    Writes JSON-lines log files for each session.
    Implements context-manager protocol so file handles are
    guaranteed to be closed even on unhandled exceptions.
    """
    def __init__(self, log_dir: str = "../data/sessions"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._session_id: Optional[str] = None
        self._log_file = None
        self._event_count = 0

    # ── Context-manager protocol ──────────────────────────────
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._close_file()
        return False  # do not suppress exceptions

    def __del__(self):
        # Safety net: close the file handle if the caller forgot
        self._close_file()

    # ── Public API ────────────────────────────────────────────
    def start_session(
        self, session_id: str, mission_name: str
    ) -> None:
        """Start logging for a new session."""
        # Close any previously open file (defensive)
        self._close_file()

        self._session_id = session_id
        self._event_count = 0

        filepath = self.log_dir / f"{session_id}.jsonl"
        self._log_file = open(filepath, "w", encoding="utf-8")

        self._write_event("SESSION_START", {
            "session_id": session_id,
            "mission_name": mission_name,
        })

        logger.info(f"Session log started: {filepath}")

    def end_session(
        self,
        progress: Dict = None,
        alerts: list = None,
    ) -> None:
        """End session logging."""
        self._write_event("SESSION_END", {
            "total_events": self._event_count,
            "progress": progress,
            "alert_count": len(alerts) if alerts else 0,
        })

        self._close_file()

        logger.info(
            f"Session log ended: {self._event_count} events recorded."
        )

    def _close_file(self) -> None:
        """Safely close the log file handle."""
        if self._log_file is not None:
            try:
                self._log_file.close()
            except Exception:
                pass
            self._log_file = None

    def log_transcription(self, transcription) -> None:
        """Log a transcription event."""
        self._write_event("TRANSCRIPTION", {
            "segment_id": transcription.segment_id,
            "raw_text": transcription.raw_text,
            "processed_text": transcription.processed_text,
            "confidence": transcription.confidence,
            "speaker_turn": transcription.speaker_turn,
            "duration": transcription.duration,
            "processing_time": transcription.processing_time,
            "audio_file": transcription.audio_file_path,
        })

    def log_state_change(
        self,
        item_id: str,
        new_status: str,
        confidence: float,
    ) -> None:
        """Log a checklist state change."""
        self._write_event("STATE_CHANGE", {
            "item_id": item_id,
            "new_status": new_status,
            "confidence": confidence,
        })

    def log_alert(self, alert) -> None:
        """Log an alert."""
        self._write_event("ALERT", {
            "alert_id": alert.id,
            "severity": alert.severity.value,
            "rule_id": alert.rule_id,
            "message": alert.message,
        })

    def log_manual_override(
        self, item_id: str, new_status: str
    ) -> None:
        """Log a manual override."""
        self._write_event("MANUAL_OVERRIDE", {
            "item_id": item_id,
            "new_status": new_status,
        })

    def _write_event(
        self, event_type: str, data: Dict[str, Any]
    ) -> None:
        """Write a structured event to the log file."""
        if self._log_file is None:
            return

        self._event_count += 1
        event = {
            "event_id": self._event_count,
            "timestamp": datetime.now().isoformat(),
            "session_id": self._session_id,
            "type": event_type,
            "data": data,
        }

        try:
            self._log_file.write(json.dumps(event, default=str) + "\n")
            self._log_file.flush()
        except Exception as e:
            logger.error(f"Failed to write session log: {e}")

    

    
    


