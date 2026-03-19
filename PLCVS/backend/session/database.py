
"""
Database module using SQLite for persistent session storage.
"""

import logging
import json
from pathlib import Path
from typing import Optional, List, Dict
from datetime import datetime

import aiosqlite

logger = logging.getLogger(__name__)

DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    mission_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT DEFAULT 'ACTIVE',
    overall_progress REAL DEFAULT 0.0,
    config_snapshot TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    data TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS checklist_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL DEFAULT 0.0,
    matched_text TEXT,
    updated_by TEXT DEFAULT 'SYSTEM',
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    message TEXT NOT NULL,
    stage_id TEXT,
    item_id TEXT,
    acknowledged INTEGER DEFAULT 0,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_states_session ON checklist_states(session_id);
CREATE INDEX IF NOT EXISTS idx_alerts_session ON alerts(session_id);
"""


class Database:
    """Async SQLite database for session persistence."""

    def __init__(self, db_path: str = "../data/plcvs.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db: Optional[aiosqlite.Connection] = None

    async def connect(self) -> None:
        """Connect to database and initialize schema."""
        logger.info(f"Connecting to database: {self.db_path}")
        self._db = await aiosqlite.connect(str(self.db_path))
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(DB_SCHEMA)
        await self._db.commit()
        logger.info("Database connected and schema initialized.")

    async def disconnect(self) -> None:
        """Close database connection."""
        if self._db:
            await self._db.close()
            self._db = None
            logger.info("Database disconnected.")

    async def create_session(
        self,
        session_id: str,
        mission_id: str,
        mission_name: str,
        config_snapshot: dict = None,
    ) -> None:
        """Create a new session record."""
        await self._db.execute(
            """INSERT INTO sessions 
               (id, mission_id, mission_name, start_time, config_snapshot) 
               VALUES (?, ?, ?, ?, ?)""",
            (
                session_id,
                mission_id,
                mission_name,
                datetime.now().isoformat(),
                json.dumps(config_snapshot) if config_snapshot else None,
            ),
        )
        await self._db.commit()

    async def end_session(
        self, session_id: str, progress: float
    ) -> None:
        """Mark session as ended."""
        await self._db.execute(
            """UPDATE sessions 
               SET end_time = ?, status = 'COMPLETED', overall_progress = ? 
               WHERE id = ?""",
            (datetime.now().isoformat(), progress, session_id),
        )
        await self._db.commit()

    async def log_event(
        self,
        session_id: str,
        event_type: str,
        data: dict,
    ) -> None:
        """Log a session event."""
        await self._db.execute(
            """INSERT INTO session_events 
               (session_id, event_type, timestamp, data) 
               VALUES (?, ?, ?, ?)""",
            (
                session_id,
                event_type,
                datetime.now().isoformat(),
                json.dumps(data, default=str),
            ),
        )
        await self._db.commit()

    async def save_checklist_state(
        self,
        session_id: str,
        item_id: str,
        status: str,
        confidence: float,
        matched_text: str = None,
        updated_by: str = "SYSTEM",
    ) -> None:
        """Save a checklist state change."""
        await self._db.execute(
            """INSERT INTO checklist_states 
               (session_id, item_id, status, confidence, 
                matched_text, updated_by, timestamp) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                item_id,
                status,
                confidence,
                matched_text,
                updated_by,
                datetime.now().isoformat(),
            ),
        )
        await self._db.commit()

    async def save_alert(
        self,
        alert_id: str,
        session_id: str,
        severity: str,
        rule_id: str,
        message: str,
        stage_id: str = None,
        item_id: str = None,
    ) -> None:
        """Save an alert."""
        await self._db.execute(
            """INSERT INTO alerts 
               (id, session_id, severity, rule_id, message, 
                stage_id, item_id, timestamp) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                alert_id,
                session_id,
                severity,
                rule_id,
                message,
                stage_id,
                item_id,
                datetime.now().isoformat(),
            ),
        )
        await self._db.commit()

    async def get_session(self, session_id: str) -> Optional[Dict]:
        """Get session details."""
        async with self._db.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def get_all_sessions(self, limit: int = 50) -> List[Dict]:
        """Get all sessions, most recent first."""
        async with self._db.execute(
            "SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?",
            (limit,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def get_session_events(
        self, session_id: str
    ) -> List[Dict]:
        """Get all events for a session."""
        async with self._db.execute(
            """SELECT * FROM session_events 
               WHERE session_id = ? ORDER BY timestamp""",
            (session_id,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
