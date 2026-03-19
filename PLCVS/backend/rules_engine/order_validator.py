# order_validator.py
"""
Order Validator

Validates that checklist items are being verified
in the correct sequence within stages.
"""


import logging
from typing import List, Optional, Dict

from checklist.config_loader import ChecklistConfig
from checklist.state_manager import ChecklistStateManager, ItemStatus

logger = logging.getLogger(__name__)

class OrderViolation:
    """Represents an order violation."""

    def __init__(
        self,
        rule_id: str,
        severity: str,
        message: str,
        stage_id: str,
        item_id: str,
        expected_item_id: str,
        suggestion: str = "",
    ):
        self.rule_id = rule_id
        self.severity = severity
        self.message = message
        self.stage_id = stage_id
        self.item_id = item_id
        self.expected_item_id = expected_item_id
        self.suggestion = suggestion

class OrderValidator:
    """
    Validates item execution order within STRICT stages.
    """

    def __init__(
        self,
        config: ChecklistConfig,
        state_manager: ChecklistStateManager,
    ):
        self.config = config
        self.state = state_manager

    def validate_item_order(
        self, stage_id: str, item_id: str
    ) -> List[OrderViolation]:
        """
        Check if verifying this item violates the stage order.

        Args:
            stage_id: Stage being worked on.
            item_id: Item being verified.

        Returns:
            List of OrderViolation if any ordering issues found.
        """
        violations = []

        stage_cfg = self.config.get_stage(stage_id)
        if stage_cfg is None:
            return violations

        # Only enforce order for STRICT stages
        if stage_cfg.type != "STRICT":
            return violations

        # Get sorted items in this stage
        sorted_items = sorted(
            stage_cfg.items, key=lambda i: i.order_in_stage
        )

        current_item_cfg = self.config.get_item(item_id)
        if current_item_cfg is None:
            return violations

        current_order = current_item_cfg.order_in_stage

        # Check preceding mandatory items
        for item_cfg in sorted_items:
            if item_cfg.order_in_stage >= current_order:
                break

            if not item_cfg.mandatory:
                continue

            item_state = self.state.get_item_state(item_cfg.id)
            if item_state and item_state.status not in (
                ItemStatus.CONFIRMED,
                ItemStatus.SKIPPED,
            ):
                violations.append(OrderViolation(
                    rule_id="RULE_003",
                    severity="WARNING",
                    message=(
                        f"Item '{current_item_cfg.name}' "
                        f"(order: {current_order}) is being verified before "
                        f"'{item_cfg.name}' (order: {item_cfg.order_in_stage}) "
                        f"which is still {item_state.status.value}."
                    ),
                    stage_id=stage_id,
                    item_id=item_id,
                    expected_item_id=item_cfg.id,
                    suggestion=f"Verify '{item_cfg.name}' first.",
                ))

        return violations

    def get_expected_next_item(
        self, stage_id: str
    ) -> Optional[str]:
        """Get the next item that should be verified in a STRICT stage."""
        stage_cfg = self.config.get_stage(stage_id)
        if stage_cfg is None:
            return None

        sorted_items = sorted(
            stage_cfg.items, key=lambda i: i.order_in_stage
        )

        for item_cfg in sorted_items:
            item_state = self.state.get_item_state(item_cfg.id)
            if item_state and item_state.status == ItemStatus.PENDING:
                return item_cfg.id

        return None

