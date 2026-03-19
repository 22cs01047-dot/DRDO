# alert_generator.py
"""
Alert Generator

Generates and manages alerts based on rule violations,
state changes, and system events.
"""

import logging
import uuid
from typing import List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class AlertSeverity(Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class Alert:
    """System alert."""
    id: str
    timestamp: datetime
    severity: AlertSeverity
    rule_id: str
    message: str
    stage_id: Optional[str] = None
    item_id: Optional[str] = None
    suggestion: str = ""
    acknowledged: bool = False


class AlertGenerator:
    """
    Generates and stores alerts during a session.
    """

    def __init__(self, max_alerts: int = 1000):
        self._alerts: List[Alert] = []
        self._max_alerts = max_alerts
        self._callbacks: List[Callable[[Alert], None]] = []

    def add_callback(self, callback: Callable[[Alert], None]) -> None:
        """Register a callback for new alerts."""
        self._callbacks.append(callback)

    def generate(
        self,
        severity: AlertSeverity,
        rule_id: str,
        message: str,
        stage_id: Optional[str] = None,
        item_id: Optional[str] = None,
        suggestion: str = "",
    ) -> Alert:
        """Generate a new alert."""
        alert = Alert(
            id=f"ALERT_{uuid.uuid4().hex[:8].upper()}",
            timestamp=datetime.now(),
            severity=severity,
            rule_id=rule_id,
            message=message,
            stage_id=stage_id,
            item_id=item_id,
            suggestion=suggestion,
        )

        self._alerts.append(alert)

        # Trim if needed
        if len(self._alerts) > self._max_alerts:
            self._alerts = self._alerts[-self._max_alerts:]

        log_fn = {
            AlertSeverity.INFO: logger.info,
            AlertSeverity.WARNING: logger.warning,
            AlertSeverity.CRITICAL: logger.critical,
        }.get(severity, logger.info)

        log_fn(f"🔔 ALERT [{severity.value}] {rule_id}: {message}")

        # Invoke callbacks
        for callback in self._callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Alert callback error: {e}")

        return alert

    def generate_info(self, rule_id: str, message: str, **kwargs) -> Alert:
        return self.generate(AlertSeverity.INFO, rule_id, message, **kwargs)

    def generate_warning(self, rule_id: str, message: str, **kwargs) -> Alert:
        return self.generate(AlertSeverity.WARNING, rule_id, message, **kwargs)

    def generate_critical(self, rule_id: str, message: str, **kwargs) -> Alert:
        return self.generate(AlertSeverity.CRITICAL, rule_id, message, **kwargs)

    def get_alerts(
        self,
        severity: Optional[AlertSeverity] = None,
        limit: int = 50,
    ) -> List[Alert]:
        """Get alerts, optionally filtered by severity."""
        alerts = self._alerts
        if severity:
            alerts = [a for a in alerts if a.severity == severity]
        return alerts[-limit:]

    def get_unacknowledged(self) -> List[Alert]:
        """Get unacknowledged alerts."""
        return [a for a in self._alerts if not a.acknowledged]

    def acknowledge(self, alert_id: str) -> bool:
        """Acknowledge an alert."""
        for alert in self._alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                return True
        return False

    def get_critical_count(self) -> int:
        """Get count of unacknowledged critical alerts."""
        return sum(
            1 for a in self._alerts
            if a.severity == AlertSeverity.CRITICAL and not a.acknowledged
        )

    def clear(self) -> None:
        """Clear all alerts."""
        self._alerts.clear()

    def to_list(self) -> List[dict]:
        """Serialize all alerts."""
        return [
            {
                "id": a.id,
                "timestamp": a.timestamp.isoformat(),
                "severity": a.severity.value,
                "rule_id": a.rule_id,
                "message": a.message,
                "stage_id": a.stage_id,
                "item_id": a.item_id,
                "suggestion": a.suggestion,
                "acknowledged": a.acknowledged,
            }
            for a in self._alerts
        ]
