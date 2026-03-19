# __init__.py
"""
Checklist Module

Handles loading checklist configuration, matching transcriptions
to checklist items, tracking state, and computing progress.
"""
from checklist.config_loader import (
    load_checklist_config,
    ChecklistConfig,
    ChecklistItemConfig,
    StageConfig,
)
from checklist.matcher import ChecklistMatcher, ChecklistMatchResult
from checklist.state_manager import (
    ChecklistStateManager,
    ItemStatus,
    StageStatus,
    ItemState,
    StageState,
)
from checklist.progress_tracker import ProgressTracker, ProgressReport

__all__ = [
    # Config loader
    "load_checklist_config",
    "ChecklistConfig",
    "ChecklistItemConfig",
    "StageConfig",
    # Matcher
    "ChecklistMatcher",
    "ChecklistMatchResult",
    # State manager
    "ChecklistStateManager",
    "ItemStatus",
    "StageStatus",
    "ItemState",
    "StageState",
    # Progress tracker
    "ProgressTracker",
    "ProgressReport",
]
