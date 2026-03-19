# progress_tracker.py
"""
Progress Tracker

Computes overall mission progress and per-stage progress.
"""

import logging
from typing import Dict, List
from dataclasses import dataclass

from checklist.state_manager import (
    ChecklistStateManager,
    ItemStatus,
    StageStatus,
)
from checklist.config_loader import ChecklistConfig

logger = logging.getLogger(__name__)


@dataclass
class ProgressReport:
    """Overall progress report."""

    overall_progress: float  # 0-100
    total_items: int
    confirmed_items: int
    failed_items: int
    pending_items: int
    ambiguous_items: int
    stages_complete: int
    stages_total: int
    stages_failed: int
    is_launch_ready: bool
    stage_details: List[Dict]


class ProgressTracker:
    """
    Tracks and computes mission progress.
    """

    def __init__(
        self,
        config: ChecklistConfig,
        state_manager: ChecklistStateManager,
    ):
        self.config = config
        self.state = state_manager

    def get_progress(self) -> ProgressReport:
        """Calculate current progress report."""
        stages = self.state.get_all_stages()
        all_items = self.state.get_all_items()

        # Count item statuses
        confirmed = sum(
            1 for i in all_items.values()
            if i.status == ItemStatus.CONFIRMED
        )
        failed = sum(
            1 for i in all_items.values()
            if i.status == ItemStatus.FAILED
        )
        pending = sum(
            1 for i in all_items.values()
            if i.status == ItemStatus.PENDING
        )
        ambiguous = sum(
            1 for i in all_items.values()
            if i.status == ItemStatus.AMBIGUOUS
        )

        total = len(all_items)

        # Count mandatory items only for progress
        mandatory_items = {
            iid: item for iid, item in all_items.items()
            if self.config.get_item(iid) and self.config.get_item(iid).mandatory
        }
        mandatory_total = len(mandatory_items)
        mandatory_confirmed = sum(
            1 for i in mandatory_items.values()
            if i.status == ItemStatus.CONFIRMED
        )

        overall_progress = (
            (mandatory_confirmed / mandatory_total * 100)
            if mandatory_total > 0 else 0.0
        )

        stages_complete = sum(
            1 for s in stages if s.status == StageStatus.CONFIRMED
        )
        stages_failed = sum(
            1 for s in stages if s.status == StageStatus.FAILED
        )

        is_launch_ready = (
            stages_complete == len(stages)
            and failed == 0
            and ambiguous == 0
        )

        # Stage details
        stage_details = []
        for s in stages:
            stage_details.append({
                "stage_id": s.stage_id,
                "stage_name": s.stage_name,
                "order": s.order,
                "status": s.status.value,
                "progress": s.progress,
                "total_items": len(s.items),
                "confirmed_items": sum(
                    1 for i in s.items.values()
                    if i.status == ItemStatus.CONFIRMED
                ),
                "failed_items": sum(
                    1 for i in s.items.values()
                    if i.status == ItemStatus.FAILED
                ),
            })

        return ProgressReport(
            overall_progress=round(overall_progress, 1),
            total_items=total,
            confirmed_items=confirmed,
            failed_items=failed,
            pending_items=pending,
            ambiguous_items=ambiguous,
            stages_complete=stages_complete,
            stages_total=len(stages),
            stages_failed=stages_failed,
            is_launch_ready=is_launch_ready,
            stage_details=stage_details,
        )

    def get_next_pending_item(self) -> Dict:
        """Get the next expected checklist item to be verified."""
        for stage in self.state.get_all_stages():
            if stage.status in (StageStatus.PENDING, StageStatus.IN_PROGRESS):
                stage_cfg = self.config.get_stage(stage.stage_id)
                if stage_cfg:
                    sorted_items = sorted(
                        stage_cfg.items,
                        key=lambda i: i.order_in_stage,
                    )
                    for item_cfg in sorted_items:
                        item_state = self.state.get_item_state(item_cfg.id)
                        if item_state and item_state.status == ItemStatus.PENDING:
                            return {
                                "item_id": item_cfg.id,
                                "item_name": item_cfg.name,
                                "stage_id": stage.stage_id,
                                "stage_name": stage.stage_name,
                            }
        return {}