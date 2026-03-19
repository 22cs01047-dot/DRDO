# rule_loader.py
"""
Rule Loader — loads and provides access to validation rules.
"""

import logging
from typing import List, Dict, Optional

from checklist.config_loader import ChecklistConfig, RuleConfig

logger = logging.getLogger(__name__)


class RuleLoader:
    """Loads and manages validation rules from configuration."""

    def __init__(self, config: ChecklistConfig):
        self.config = config
        self._rules: Dict[str, RuleConfig] = {}
        self._rules_by_type: Dict[str, List[RuleConfig]] = {}
        self._load_rules()

    def _load_rules(self) -> None:
        """Load rules from config."""
        for rule in self.config.rules:
            self._rules[rule.id] = rule

            if rule.type not in self._rules_by_type:
                self._rules_by_type[rule.type] = []
            self._rules_by_type[rule.type].append(rule)

        logger.info(f"Loaded {len(self._rules)} rules.")

    def get_rule(self, rule_id: str) -> Optional[RuleConfig]:
        """Get a rule by ID."""
        return self._rules.get(rule_id)

    def get_rules_by_type(self, rule_type: str) -> List[RuleConfig]:
        """Get all rules of a specific type."""
        return self._rules_by_type.get(rule_type, [])

    def get_all_rules(self) -> List[RuleConfig]:
        """Get all rules."""
        return list(self._rules.values())

    def is_rule_enabled(self, rule_id: str) -> bool:
        """Check if a rule is enabled."""
        return rule_id in self._rules

    @property
    def rule_types(self) -> List[str]:
        return list(self._rules_by_type.keys())
