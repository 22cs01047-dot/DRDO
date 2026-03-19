# dependency_validator.py
"""
Dependency Validator for checklist stage ordering and item dependencies.
"""

import logging
from typing import List, Optional
from dataclasses import dataclass
from enum import Enum

from rules_engine.alert_generator import AlertSeverity

logger = logging.getLogger(__name__)


class DependencyType(Enum):
    STRICT = "STRICT"      # Must complete before next
    SOFT = "SOFT"          # Recommended order
    PARALLEL = "PARALLEL"  # Can run simultaneously
    INDEPENDENT = "INDEPENDENT"  # No dependency


@dataclass
class ValidationAlert:
    severity: AlertSeverity
    rule_id: str
    message: str
    stage_id: Optional[str] = None
    item_id: Optional[str] = None
    suggestion: str = ""


class DependencyValidator:
    """
    Validates stage dependencies and checklist item ordering.
    """

    def __init__(self, checklist_config: dict):
        self.config = checklist_config
        self.stages = {s["id"]: s for s in checklist_config.get("stages", [])}
        self.stage_order = [s["id"] for s in
                           sorted(checklist_config.get("stages", []),
                                  key=lambda x: x["order"])]

    def validate_stage_transition(
        self,
        current_stage_id: str,
        stage_states: dict,
    ) -> List[ValidationAlert]:
        """
        Validate if the current stage can proceed based on dependencies.
        
        Args:
            current_stage_id: Stage being worked on
            stage_states: Dict of stage_id -> state info
            
        Returns:
            List of validation alerts
        """
        alerts = []
        stage = self.stages.get(current_stage_id)

        if not stage:
            alerts.append(ValidationAlert(
                severity=AlertSeverity.CRITICAL,
                rule_id="RULE_INVALID_STAGE",
                message=f"Unknown stage: {current_stage_id}",
            ))
            return alerts

        dependency = stage.get("dependency")
        dep_type = DependencyType(stage.get("type", "INDEPENDENT"))

        if dependency and dep_type == DependencyType.STRICT:
            dep_state = stage_states.get(dependency, {})
            dep_status = dep_state.get("status", "PENDING")

            if dep_status != "CONFIRMED":
                dep_stage = self.stages.get(dependency, {})
                alerts.append(ValidationAlert(
                    severity=AlertSeverity.CRITICAL,
                    rule_id="RULE_DEPENDENCY_VIOLATION",
                    message=(
                        f"Stage '{stage['name']}' cannot proceed. "
                        f"Dependency stage '{dep_stage.get('name', dependency)}' "
                        f"is not complete (status: {dep_status})."
                    ),
                    stage_id=current_stage_id,
                    suggestion=(
                        f"Complete all items in "
                        f"'{dep_stage.get('name', dependency)}' first."
                    ),
                ))

        elif dependency and dep_type == DependencyType.SOFT:
            dep_state = stage_states.get(dependency, {})
            dep_status = dep_state.get("status", "PENDING")

            if dep_status != "CONFIRMED":
                dep_stage = self.stages.get(dependency, {})
                alerts.append(ValidationAlert(
                    severity=AlertSeverity.WARNING,
                    rule_id="RULE_SOFT_DEPENDENCY",
                    message=(
                        f"Stage '{stage['name']}' is proceeding but "
                        f"recommended dependency '{dep_stage.get('name', dependency)}' "
                        f"is not yet complete."
                    ),
                    stage_id=current_stage_id,
                ))

        return alerts

    def validate_item_order(
        self,
        stage_id: str,
        item_id: str,
        item_states: dict,
    ) -> List[ValidationAlert]:
        """
        Validate if a checklist item is being checked in the correct order.
        
        Args:
            stage_id: Current stage
            item_id: Item being checked
            item_states: Dict of item_id -> state info
            
        Returns:
            List of validation alerts
        """
        alerts = []
        stage = self.stages.get(stage_id)

        if not stage:
            return alerts

        dep_type = DependencyType(stage.get("type", "INDEPENDENT"))

        if dep_type not in (DependencyType.STRICT,):
            return alerts  # No order enforcement for non-strict stages

        items = stage.get("checklist_items", [])
        items_sorted = sorted(items, key=lambda x: x.get("order_in_stage", 0))

        current_item = None
        current_order = None
        for item in items_sorted:
            if item["id"] == item_id:
                current_item = item
                current_order = item.get("order_in_stage", 0)
                break

        if current_item is None:
            return alerts

        # Check if previous items are completed
        for item in items_sorted:
            item_order = item.get("order_in_stage", 0)
            if item_order < current_order and item.get("mandatory", True):
                state = item_states.get(item["id"], {})
                status = state.get("status", "PENDING")

                if status not in ("CONFIRMED",):
                    alerts.append(ValidationAlert(
                        severity=AlertSeverity.WARNING,
                        rule_id="RULE_ORDER_VIOLATION",
                        message=(
                            f"Item '{current_item['name']}' (order: {current_order}) "
                            f"is being checked before '{item['name']}' "
                            f"(order: {item_order}) which is still {status}."
                        ),
                        stage_id=stage_id,
                        item_id=item_id,
                        suggestion=f"Complete '{item['name']}' first.",
                    ))

        return alerts

    def validate_stage_completion(
        self,
        stage_id: str,
        item_states: dict,
    ) -> List[ValidationAlert]:
        """
        Validate if all mandatory items in a stage are complete.
        
        Returns:
            List of alerts for incomplete mandatory items
        """
        alerts = []
        stage = self.stages.get(stage_id)

        if not stage:
            return alerts

        items = stage.get("checklist_items", [])
        incomplete = []

        for item in items:
            if item.get("mandatory", True):
                state = item_states.get(item["id"], {})
                status = state.get("status", "PENDING")

                if status != "CONFIRMED":
                    incomplete.append(item["name"])

        if incomplete:
            alerts.append(ValidationAlert(
                severity=AlertSeverity.CRITICAL,
                rule_id="RULE_INCOMPLETE_STAGE",
                message=(
                    f"Stage '{stage['name']}' has {len(incomplete)} "
                    f"incomplete mandatory items: {', '.join(incomplete)}"
                ),
                stage_id=stage_id,
                suggestion="Complete all mandatory items before proceeding.",
            ))

        return alerts

    def get_next_expected_item(
        self,
        stage_id: str,
        item_states: dict,
    ) -> Optional[dict]:
        """Get the next expected checklist item in sequence"""
        stage = self.stages.get(stage_id)
        if not stage:
            return None

        items = sorted(
            stage.get("checklist_items", []),
            key=lambda x: x.get("order_in_stage", 0),
        )

        for item in items:
            state = item_states.get(item["id"], {})
            status = state.get("status", "PENDING")
            if status in ("PENDING", "IN_PROGRESS"):
                return item

        return None