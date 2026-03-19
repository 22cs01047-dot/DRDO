"""
Integration tests for the full pipeline.
These test the components working together.
"""

import pytest
import yaml
import numpy as np
from pathlib import Path

from checklist.config_loader import load_checklist_config
from checklist.state_manager import ChecklistStateManager, ItemStatus
from checklist.progress_tracker import ProgressTracker
from rules_engine.alert_generator import AlertGenerator
from rules_engine.order_validator import OrderValidator
from nlp_engine.intent_classifier import IntentClassifier, ResponseIntent
from stt_engine.post_processor import PostProcessor


@pytest.fixture
def full_config(tmp_path):
    """Create a realistic config for integration testing."""
    config_data = {
        "mission": {
            "id": "INT_TEST",
            "name": "Integration Test Mission",
            "version": "1.0",
        },
        "stages": [
            {
                "id": "STG_01",
                "name": "Propulsion",
                "order": 1,
                "dependency": None,
                "type": "STRICT",
                "description": "Propulsion checks",
                "checklist_items": [
                    {
                        "id": "CI_001",
                        "name": "Fuel Pressure",
                        "keywords": ["fuel pressure"],
                        "expected_responses": {
                            "positive": ["nominal", "confirmed"],
                            "negative": ["failed", "low"],
                        },
                        "mandatory": True,
                        "order_in_stage": 1,
                    },
                    {
                        "id": "CI_002",
                        "name": "Oxidizer Level",
                        "keywords": ["oxidizer level"],
                        "expected_responses": {
                            "positive": ["full", "nominal"],
                            "negative": ["low"],
                        },
                        "mandatory": True,
                        "order_in_stage": 2,
                    },
                ],
            },
            {
                "id": "STG_02",
                "name": "Guidance",
                "order": 2,
                "dependency": "STG_01",
                "type": "STRICT",
                "description": "Guidance checks",
                "checklist_items": [
                    {
                        "id": "CI_003",
                        "name": "INS Alignment",
                        "keywords": ["INS alignment"],
                        "expected_responses": {
                            "positive": ["aligned"],
                            "negative": ["misaligned"],
                        },
                        "mandatory": True,
                        "order_in_stage": 1,
                    },
                ],
            },
        ],
        "rules": [],
    }
    filepath = tmp_path / "int_config.yaml"
    with open(filepath, "w") as f:
        yaml.dump(config_data, f)
    return str(filepath)


class TestFullPipeline:
    """Test components working together."""

    def test_complete_checklist_flow(self, full_config):
        """Simulate a complete checklist verification flow."""
        # Load config
        config = load_checklist_config(full_config)
        state = ChecklistStateManager(config)
        progress = ProgressTracker(config, state)
        alerts = AlertGenerator()
        order_val = OrderValidator(config, state)
        intent_clf = IntentClassifier()

        # Initial state
        report = progress.get_progress()
        assert report.overall_progress == 0.0
        assert not report.is_launch_ready

        # Simulate: CI_001 — Fuel Pressure Confirmed
        intent, conf = intent_clf.classify("fuel pressure nominal, confirmed")
        assert intent == ResponseIntent.CONFIRMED

        state.update_item("CI_001", ItemStatus.CONFIRMED, confidence=0.92)
        report = progress.get_progress()
        assert report.confirmed_items == 1

        # Simulate: CI_002 — Oxidizer Level Confirmed
        state.update_item("CI_002", ItemStatus.CONFIRMED, confidence=0.88)
        report = progress.get_progress()
        assert report.confirmed_items == 2

        # Stage 1 should be complete now
        stage1 = state.get_stage_state("STG_01")
        assert stage1.status.value == "CONFIRMED"

        # Simulate: CI_003 — INS Alignment Confirmed
        state.update_item("CI_003", ItemStatus.CONFIRMED, confidence=0.95)

        # Final progress
        report = progress.get_progress()
        assert report.overall_progress == 100.0
        assert report.is_launch_ready

    def test_failure_handling(self, full_config):
        """Test handling of a failed checklist item."""
        config = load_checklist_config(full_config)
        state = ChecklistStateManager(config)
        alerts = AlertGenerator()

        # Simulate failure
        state.update_item("CI_001", ItemStatus.FAILED, confidence=0.90)

        stage = state.get_stage_state("STG_01")
        assert stage.status.value == "FAILED"

        # Generate alert
        alert = alerts.generate_critical(
            "RULE_002",
            "Fuel Pressure check FAILED",
            item_id="CI_001",
        )
        assert alerts.get_critical_count() == 1

    def test_order_violation_detection(self, full_config):
        """Test out-of-order item detection."""
        config = load_checklist_config(full_config)
        state = ChecklistStateManager(config)
        order_val = OrderValidator(config, state)

        # Try to verify CI_002 before CI_001
        violations = order_val.validate_item_order("STG_01", "CI_002")
        assert len(violations) == 1
        assert ("CI_001" in violations[0].message
                or "Item 1" in violations[0].message
                or "Fuel Pressure" in violations[0].message)

    def test_post_processor_in_pipeline(self):
        """Test post-processor cleans STT output properly."""
        processor = PostProcessor()

        # Simulated noisy STT output
        raw = "uh um fuel presser is is nominal confirmed"
        cleaned = processor.process(raw)

        # Should be cleaned up
        assert "uh" not in cleaned
        assert "fuel pressure" in cleaned
        assert "nominal" in cleaned
