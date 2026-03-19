"""Unit tests for checklist module."""

import pytest
import yaml
from pathlib import Path

from checklist.config_loader import load_checklist_config, ChecklistConfig
from checklist.state_manager import ChecklistStateManager, ItemStatus


class TestConfigLoader:
    """Tests for checklist config loading."""

    @pytest.fixture
    def sample_config_path(self, tmp_path):
        config = {
            "mission": {
                "id": "TEST_001",
                "name": "Test Mission",
                "version": "1.0",
            },
            "stages": [
                {
                    "id": "STG_01",
                    "name": "Test Stage",
                    "order": 1,
                    "dependency": None,
                    "type": "STRICT",
                    "description": "Test",
                    "checklist_items": [
                        {
                            "id": "CI_001",
                            "name": "Test Item 1",
                            "keywords": ["test keyword"],
                            "expected_responses": {
                                "positive": ["confirmed"],
                                "negative": ["failed"],
                            },
                            "mandatory": True,
                            "order_in_stage": 1,
                        },
                        {
                            "id": "CI_002",
                            "name": "Test Item 2",
                            "keywords": ["another keyword"],
                            "expected_responses": {
                                "positive": ["okay"],
                                "negative": ["not okay"],
                            },
                            "mandatory": True,
                            "order_in_stage": 2,
                        },
                    ],
                }
            ],
            "rules": [
                {
                    "id": "RULE_001",
                    "description": "Test rule",
                    "type": "STAGE_COMPLETION",
                    "severity": "CRITICAL",
                }
            ],
        }
        filepath = tmp_path / "test_checklist.yaml"
        with open(filepath, "w") as f:
            yaml.dump(config, f)
        return str(filepath)

    def test_load_config(self, sample_config_path):
        config = load_checklist_config(sample_config_path)
        assert config.mission_id == "TEST_001"
        assert len(config.stages) == 1
        assert config.total_items == 2

    def test_get_item(self, sample_config_path):
        config = load_checklist_config(sample_config_path)
        item = config.get_item("CI_001")
        assert item is not None
        assert item.name == "Test Item 1"

    def test_get_stage_for_item(self, sample_config_path):
        config = load_checklist_config(sample_config_path)
        stage = config.get_stage_for_item("CI_001")
        assert stage is not None
        assert stage.id == "STG_01"

    def test_missing_config_raises(self):
        with pytest.raises(FileNotFoundError):
            load_checklist_config("/nonexistent/path.yaml")

class TestStateManager:
    """Tests for checklist state management."""

    @pytest.fixture
    def state_manager(self, tmp_path):
        config_data = {
            "mission": {"id": "T", "name": "T", "version": "1"},
            "stages": [
                {
                    "id": "S1",
                    "name": "Stage 1",
                    "order": 1,
                    "dependency": None,
                    "type": "STRICT",
                    "description": "",
                    "checklist_items": [
                        {
                            "id": "I1",
                            "name": "Item 1",
                            "keywords": ["k1"],
                            "expected_responses": {"positive": ["ok"], "negative": ["no"]},
                            "mandatory": True,
                            "order_in_stage": 1,
                        },
                        {
                            "id": "I2",
                            "name": "Item 2",
                            "keywords": ["k2"],
                            "expected_responses": {"positive": ["ok"], "negative": ["no"]},
                            "mandatory": True,
                            "order_in_stage": 2,
                        },
                    ],
                }
            ],
            "rules": [],
        }
        filepath = tmp_path / "cfg.yaml"
        with open(filepath, "w") as f:
            yaml.dump(config_data, f)
        config = load_checklist_config(str(filepath))
        return ChecklistStateManager(config)

    def test_initial_state(self, state_manager):
        state = state_manager.get_item_state("I1")
        assert state.status == ItemStatus.PENDING

    def test_update_item(self, state_manager):
        state_manager.update_item("I1", ItemStatus.CONFIRMED, confidence=0.95)
        state = state_manager.get_item_state("I1")
        assert state.status == ItemStatus.CONFIRMED
        assert state.confidence == 0.95

    def test_stage_progress(self, state_manager):
        state_manager.update_item("I1", ItemStatus.CONFIRMED)
        stage = state_manager.get_stage_state("S1")
        assert stage.progress == 50.0

    def test_stage_complete(self, state_manager):
        state_manager.update_item("I1", ItemStatus.CONFIRMED)
        state_manager.update_item("I2", ItemStatus.CONFIRMED)
        stage = state_manager.get_stage_state("S1")
        assert stage.progress == 100.0
        assert stage.status.value == "CONFIRMED"

    def test_stage_failed(self, state_manager):
        state_manager.update_item("I1", ItemStatus.FAILED)
        stage = state_manager.get_stage_state("S1")
        assert stage.status.value == "FAILED"

    def test_snapshot(self, state_manager):
        snapshot = state_manager.get_snapshot()
        assert "stages" in snapshot
        assert "S1" in snapshot["stages"]

    def test_reset(self, state_manager):
        state_manager.update_item("I1", ItemStatus.CONFIRMED)
        state_manager.reset()
        state = state_manager.get_item_state("I1")
        assert state.status == ItemStatus.PENDING
