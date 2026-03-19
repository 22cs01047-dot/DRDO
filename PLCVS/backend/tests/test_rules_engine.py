"""Unit tests for rules engine."""

import pytest
from rules_engine.alert_generator import AlertGenerator, AlertSeverity
from rules_engine.order_validator import OrderValidator
from checklist.config_loader import load_checklist_config
from checklist.state_manager import ChecklistStateManager, ItemStatus
import yaml


@pytest.fixture
def setup_validators(tmp_path):
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
                        "id": "I1", "name": "Item 1",
                        "keywords": ["k1"],
                        "expected_responses": {"positive": ["ok"], "negative": ["no"]},
                        "mandatory": True, "order_in_stage": 1,
                    },
                    {
                        "id": "I2", "name": "Item 2",
                        "keywords": ["k2"],
                        "expected_responses": {"positive": ["ok"], "negative": ["no"]},
                        "mandatory": True, "order_in_stage": 2,
                    },
                    {
                        "id": "I3", "name": "Item 3",
                        "keywords": ["k3"],
                        "expected_responses": {"positive": ["ok"], "negative": ["no"]},
                        "mandatory": True, "order_in_stage": 3,
                    },
                ],
            },
            {
                "id": "S2",
                "name": "Stage 2",
                "order": 2,
                "dependency": "S1",
                "type": "STRICT",
                "description": "",
                "checklist_items": [
                    {
                        "id": "I4", "name": "Item 4",
                        "keywords": ["k4"],
                        "expected_responses": {"positive": ["ok"], "negative": ["no"]},
                        "mandatory": True, "order_in_stage": 1,
                    },
                ],
            },
        ],
        "rules": [],
    }
    filepath = tmp_path / "cfg.yaml"
    with open(filepath, "w") as f:
        yaml.dump(config_data, f)
    config = load_checklist_config(str(filepath))
    state = ChecklistStateManager(config)
    order_val = OrderValidator(config, state)
    return config, state, order_val


class TestOrderValidator:
    def test_no_violation_in_order(self, setup_validators):
        config, state, order_val = setup_validators
        violations = order_val.validate_item_order("S1", "I1")
        assert len(violations) == 0

    def test_violation_out_of_order(self, setup_validators):
        config, state, order_val = setup_validators
        # Try to verify I3 without I1 and I2 done
        violations = order_val.validate_item_order("S1", "I3")
        assert len(violations) == 2  # I1 and I2 are pending

    def test_no_violation_after_completion(self, setup_validators):
        config, state, order_val = setup_validators
        state.update_item("I1", ItemStatus.CONFIRMED)
        state.update_item("I2", ItemStatus.CONFIRMED)
        violations = order_val.validate_item_order("S1", "I3")
        assert len(violations) == 0


class TestAlertGenerator:
    def test_generate_alert(self):
        gen = AlertGenerator()
        alert = gen.generate_info("R1", "Test alert")
        assert alert.severity == AlertSeverity.INFO
        assert alert.message == "Test alert"

    def test_alert_counts(self):
        gen = AlertGenerator()
        gen.generate_critical("R1", "Critical 1")
        gen.generate_critical("R2", "Critical 2")
        gen.generate_warning("R3", "Warning")
        assert gen.get_critical_count() == 2

    def test_acknowledge_alert(self):
        gen = AlertGenerator()
        alert = gen.generate_critical("R1", "Critical")
        assert gen.get_critical_count() == 1
        gen.acknowledge(alert.id)
        assert gen.get_critical_count() == 0

    def test_callback_invoked(self):
        gen = AlertGenerator()
        received = []
        gen.add_callback(lambda a: received.append(a))
        gen.generate_info("R1", "Test")
        assert len(received) == 1

    def test_clear(self):
        gen = AlertGenerator()
        gen.generate_info("R1", "Test")
        gen.generate_info("R2", "Test2")
        gen.clear()
        assert len(gen.get_alerts()) == 0