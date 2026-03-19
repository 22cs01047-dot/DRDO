# state_manager.py
"""
Checklist State Manager

Tracks the real-time state of all checklist items and stages
during a verification session.
"""

import logging
from typing import Optional, Dict, List
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from checklist.config_loader import ChecklistConfig

logger = logging.getLogger(__name__)


class ItemStatus(Enum):
    """Status of a checklist item."""

    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
    AMBIGUOUS = "AMBIGUOUS"


class StageStatus(Enum):
    """Status of a stage."""

    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"


@dataclass
class ItemState:
    """Current state of a checklist item."""

    item_id: str
    item_name: str
    stage_id: str
    status: ItemStatus = ItemStatus.PENDING
    confidence: float = 0.0
    matched_text: Optional[str] = None
    matched_segment_id: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by: str = "SYSTEM"  # SYSTEM | MANUAL
    history: List[Dict] = field(default_factory=list)


@dataclass
class StageState:
    """Current state of a stage."""

    stage_id: str
    stage_name: str
    order: int
    status: StageStatus = StageStatus.PENDING
    progress: float = 0.0
    items: Dict[str, ItemState] = field(default_factory=dict)


class ChecklistStateManager:
    """
    Manages the live state of all checklist items during a session.

    Thread-safe state updates with history tracking.
    """

    def __init__(self, config: ChecklistConfig):
        self.config = config
        self._stages: Dict[str, StageState] = {}
        self._items: Dict[str, ItemState] = {}
        self._initialize_state()

    def _initialize_state(self) -> None:
        """Initialize all items and stages to PENDING."""
        for stage_cfg in self.config.stages:
            stage_state = StageState(
                stage_id=stage_cfg.id,
                stage_name=stage_cfg.name,
                order=stage_cfg.order,
            )

            for item_cfg in stage_cfg.items:
                item_state = ItemState(
                    item_id=item_cfg.id,
                    item_name=item_cfg.name,
                    stage_id=stage_cfg.id,
                )
                stage_state.items[item_cfg.id] = item_state
                self._items[item_cfg.id] = item_state

            self._stages[stage_cfg.id] = stage_state

        logger.info(
            f"State initialized: {len(self._stages)} stages, "
            f"{len(self._items)} items"
        )

    def update_item(
        self,
        item_id: str,
        status: ItemStatus,
        confidence: float = 0.0,
        matched_text: Optional[str] = None,
        segment_id: Optional[str] = None,
        updated_by: str = "SYSTEM",
    ) -> Optional[ItemState]:
        """
        Update the status of a checklist item.

        Args:
            item_id: Checklist item ID.
            status: New status.
            confidence: Match confidence.
            matched_text: Transcribed text that triggered this update.
            segment_id: Audio segment ID.
            updated_by: SYSTEM or MANUAL.

        Returns:
            Updated ItemState or None if item not found.
        """
        item = self._items.get(item_id)
        if item is None:
            logger.warning(f"Item not found: {item_id}")
            return None

        old_status = item.status

        # Record history
        item.history.append({
            "from_status": old_status.value,
            "to_status": status.value,
            "confidence": confidence,
            "matched_text": matched_text,
            "segment_id": segment_id,
            "updated_by": updated_by,
            "timestamp": datetime.now().isoformat(),
        })

        # Update state
        item.status = status
        item.confidence = confidence
        item.matched_text = matched_text
        item.matched_segment_id = segment_id
        item.updated_at = datetime.now()
        item.updated_by = updated_by

        logger.info(
            f"Item '{item.item_name}' ({item_id}): "
            f"{old_status.value} → {status.value} "
            f"(conf={confidence:.2%}, by={updated_by})"
        )

        # Update parent stage
        self._update_stage_status(item.stage_id)

        return item

    def _update_stage_status(self, stage_id: str) -> None:
        """Recalculate stage status based on its items."""
        stage = self._stages.get(stage_id)
        if stage is None:
            return

        stage_cfg = self.config.get_stage(stage_id)
        if stage_cfg is None:
            return

        items = list(stage.items.values())
        mandatory_items = [
            i for i in items
            if self.config.get_item(i.item_id)
            and self.config.get_item(i.item_id).mandatory
        ]

        total = len(mandatory_items)
        if total == 0:
            stage.status = StageStatus.CONFIRMED
            stage.progress = 100.0
            return

        confirmed = sum(
            1 for i in mandatory_items if i.status == ItemStatus.CONFIRMED
        )
        failed = sum(
            1 for i in mandatory_items if i.status == ItemStatus.FAILED
        )
        in_progress = sum(
            1 for i in mandatory_items
            if i.status in (ItemStatus.IN_PROGRESS, ItemStatus.AMBIGUOUS)
        )

        stage.progress = round((confirmed / total) * 100, 1)

        if failed > 0:
            stage.status = StageStatus.FAILED
        elif confirmed == total:
            stage.status = StageStatus.CONFIRMED
        elif confirmed > 0 or in_progress > 0:
            stage.status = StageStatus.IN_PROGRESS
        else:
            stage.status = StageStatus.PENDING

    def get_item_state(self, item_id: str) -> Optional[ItemState]:
        """Get current state of an item."""
        return self._items.get(item_id)

    def get_stage_state(self, stage_id: str) -> Optional[StageState]:
        """Get current state of a stage."""
        return self._stages.get(stage_id)

    def get_all_stages(self) -> List[StageState]:
        """Get all stage states in order."""
        return sorted(self._stages.values(), key=lambda s: s.order)

    def get_all_items(self) -> Dict[str, ItemState]:
        """Get all item states."""
        return dict(self._items)

    def get_snapshot(self) -> Dict:
        """Get a complete snapshot of the current state."""
        return {
            "stages": {
                sid: {
                    "stage_id": s.stage_id,
                    "stage_name": s.stage_name,
                    "order": s.order,
                    "status": s.status.value,
                    "progress": s.progress,
                    "items": {
                        iid: {
                            "item_id": i.item_id,
                            "item_name": i.item_name,
                            "status": i.status.value,
                            "confidence": i.confidence,
                            "matched_text": i.matched_text,
                            "updated_at": (
                                i.updated_at.isoformat()
                                if i.updated_at else None
                            ),
                            "updated_by": i.updated_by,
                        }
                        for iid, i in s.items.items()
                    },
                }
                for sid, s in self._stages.items()
            },
            "timestamp": datetime.now().isoformat(),
        }

    def reset(self) -> None:
        """Reset all state to initial."""
        self._stages.clear()
        self._items.clear()
        self._initialize_state()
        logger.info("Checklist state reset to initial.")
        



        

    



            







