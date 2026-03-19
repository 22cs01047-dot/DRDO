"""
Validate checklist configuration files before deployment.

Checks:
- YAML syntax validity
- Required fields present
- Stage ordering consistency
- Dependency graph validity (no cycles)
- Keyword uniqueness
- Response definitions completeness

Usage:
    python scripts/validate_config.py config/checklist_config.yaml
    python scripts/validate_config.py --all
"""

import sys
import logging
import argparse
from pathlib import Path
from typing import List, Dict, Set, Tuple

import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


class ConfigValidationError:
    """Represents a single validation error."""

    def __init__(self, severity: str, field: str, message: str):
        self.severity = severity  # "ERROR" or "WARNING"
        self.field = field
        self.message = message

    def __str__(self):
        icon = "❌" if self.severity == "ERROR" else "⚠️"
        return f"  {icon} [{self.severity}] {self.field}: {self.message}"


class ConfigValidator:
    """Validates PLCVS checklist configuration files."""

    REQUIRED_MISSION_FIELDS = ["id", "name", "version"]
    REQUIRED_STAGE_FIELDS = ["id", "name", "order", "type", "checklist_items"]
    REQUIRED_ITEM_FIELDS = ["id", "name", "keywords", "mandatory"]
    VALID_STAGE_TYPES = ["STRICT", "SOFT", "PARALLEL", "INDEPENDENT"]

    def __init__(self, config_path: str):
        self.config_path = Path(config_path)
        self.errors: List[ConfigValidationError] = []
        self.config = None

    def load(self) -> bool:
        """Load and parse YAML config."""
        if not self.config_path.exists():
            self.errors.append(ConfigValidationError(
                "ERROR", "file", f"Config file not found: {self.config_path}"
            ))
            return False

        try:
            with open(self.config_path, "r") as f:
                self.config = yaml.safe_load(f)
            return True
        except yaml.YAMLError as e:
            self.errors.append(ConfigValidationError(
                "ERROR", "yaml", f"YAML parse error: {e}"
            ))
            return False

    def validate(self) -> bool:
        """Run all validation checks."""
        if not self.load():
            return False

        self._validate_mission()
        self._validate_stages()
        self._validate_dependencies()
        self._validate_ordering()
        self._validate_keywords()
        self._validate_rules()

        return not any(e.severity == "ERROR" for e in self.errors)

    def _validate_mission(self):
        """Validate mission-level fields."""
        mission = self.config.get("mission")
        if not mission:
            self.errors.append(ConfigValidationError(
                "ERROR", "mission", "Missing 'mission' section"
            ))
            return

        for field in self.REQUIRED_MISSION_FIELDS:
            if field not in mission:
                self.errors.append(ConfigValidationError(
                    "ERROR", f"mission.{field}", f"Missing required field"
                ))

    def _validate_stages(self):
        """Validate all stages and their checklist items."""
        stages = self.config.get("stages", [])
        if not stages:
            self.errors.append(ConfigValidationError(
                "ERROR", "stages", "No stages defined"
            ))
            return

        stage_ids: Set[str] = set()
        item_ids: Set[str] = set()

        for i, stage in enumerate(stages):
            # Check required stage fields
            for field in self.REQUIRED_STAGE_FIELDS:
                if field not in stage:
                    self.errors.append(ConfigValidationError(
                        "ERROR", f"stages[{i}].{field}",
                        f"Missing required field"
                    ))

            stage_id = stage.get("id", f"UNKNOWN_{i}")

            # Check duplicate stage IDs
            if stage_id in stage_ids:
                self.errors.append(ConfigValidationError(
                    "ERROR", f"stages[{i}].id",
                    f"Duplicate stage ID: {stage_id}"
                ))
            stage_ids.add(stage_id)

            # Check stage type
            stage_type = stage.get("type", "")
            if stage_type not in self.VALID_STAGE_TYPES:
                self.errors.append(ConfigValidationError(
                    "ERROR", f"stages[{i}].type",
                    f"Invalid type '{stage_type}'. "
                    f"Must be one of: {self.VALID_STAGE_TYPES}"
                ))

            # Validate checklist items
            items = stage.get("checklist_items", [])
            if not items:
                self.errors.append(ConfigValidationError(
                    "WARNING", f"stages[{i}].checklist_items",
                    f"Stage '{stage_id}' has no checklist items"
                ))

            for j, item in enumerate(items):
                for field in self.REQUIRED_ITEM_FIELDS:
                    if field not in item:
                        self.errors.append(ConfigValidationError(
                            "ERROR",
                            f"stages[{i}].items[{j}].{field}",
                            f"Missing required field"
                        ))

                item_id = item.get("id", f"UNKNOWN_{i}_{j}")
                if item_id in item_ids:
                    self.errors.append(ConfigValidationError(
                        "ERROR", f"stages[{i}].items[{j}].id",
                        f"Duplicate item ID: {item_id}"
                    ))
                item_ids.add(item_id)

                # Check keywords not empty
                keywords = item.get("keywords", [])
                if not keywords:
                    self.errors.append(ConfigValidationError(
                        "WARNING", f"stages[{i}].items[{j}].keywords",
                        f"Item '{item_id}' has no keywords defined"
                    ))

                # Check expected_responses
                responses = item.get("expected_responses", {})
                if not responses.get("positive"):
                    self.errors.append(ConfigValidationError(
                        "WARNING",
                        f"stages[{i}].items[{j}].expected_responses.positive",
                        f"Item '{item_id}' has no positive response patterns"
                    ))

    def _validate_dependencies(self):
        """Validate dependency graph — check for cycles and invalid refs."""
        stages = self.config.get("stages", [])
        stage_ids = {s["id"] for s in stages}
        adjacency: Dict[str, str] = {}

        for stage in stages:
            stage_id = stage.get("id", "")
            dep = stage.get("dependency")

            if dep:
                if dep not in stage_ids:
                    self.errors.append(ConfigValidationError(
                        "ERROR", f"stages.{stage_id}.dependency",
                        f"Dependency '{dep}' references non-existent stage"
                    ))
                elif dep == stage_id:
                    self.errors.append(ConfigValidationError(
                        "ERROR", f"stages.{stage_id}.dependency",
                        f"Stage depends on itself (self-cycle)"
                    ))
                else:
                    adjacency[stage_id] = dep

        # Detect cycles using DFS
        visited: Set[str] = set()
        rec_stack: Set[str] = set()

        def has_cycle(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)
            neighbor = adjacency.get(node)
            if neighbor:
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True
            rec_stack.discard(node)
            return False

        for stage_id in adjacency:
            if stage_id not in visited:
                if has_cycle(stage_id):
                    self.errors.append(ConfigValidationError(
                        "ERROR", "stages.dependency",
                        f"Circular dependency detected involving '{stage_id}'"
                    ))

    def _validate_ordering(self):
        """Validate stage ordering is consistent."""
        stages = self.config.get("stages", [])
        orders = [s.get("order", 0) for s in stages]

        if len(orders) != len(set(orders)):
            self.errors.append(ConfigValidationError(
                "ERROR", "stages.order",
                "Duplicate stage order values found"
            ))

        # Check item ordering within stages
        for stage in stages:
            items = stage.get("checklist_items", [])
            item_orders = [
                it.get("order_in_stage", 0) for it in items
            ]
            if len(item_orders) != len(set(item_orders)):
                self.errors.append(ConfigValidationError(
                    "WARNING", f"stages.{stage['id']}.items.order",
                    "Duplicate item order values within stage"
                ))

    def _validate_keywords(self):
        """Warn about duplicate keywords across different items."""
        stages = self.config.get("stages", [])
        keyword_map: Dict[str, str] = {}

        for stage in stages:
            for item in stage.get("checklist_items", []):
                item_id = item.get("id", "")
                for keyword in item.get("keywords", []):
                    kw_lower = keyword.lower().strip()
                    if kw_lower in keyword_map:
                        self.errors.append(ConfigValidationError(
                            "WARNING", f"keywords",
                            f"Keyword '{keyword}' used in both "
                            f"'{keyword_map[kw_lower]}' and '{item_id}'"
                        ))
                    else:
                        keyword_map[kw_lower] = item_id

    def _validate_rules(self):
        """Validate rules section if present."""
        rules = self.config.get("rules", [])
        rule_ids: Set[str] = set()

        for i, rule in enumerate(rules):
            rule_id = rule.get("id", "")
            if not rule_id:
                self.errors.append(ConfigValidationError(
                    "WARNING", f"rules[{i}].id", "Rule missing ID"
                ))
            if rule_id in rule_ids:
                self.errors.append(ConfigValidationError(
                    "ERROR", f"rules[{i}].id",
                    f"Duplicate rule ID: {rule_id}"
                ))
            rule_ids.add(rule_id)

            if not rule.get("description"):
                self.errors.append(ConfigValidationError(
                    "WARNING", f"rules[{i}].description",
                    "Rule missing description"
                ))

    def print_report(self):
        """Print validation report."""
        error_count = sum(1 for e in self.errors if e.severity == "ERROR")
        warn_count = sum(1 for e in self.errors if e.severity == "WARNING")

        print(f"\n{'='*60}")
        print(f"  PLCVS Config Validation Report")
        print(f"  File: {self.config_path}")
        print(f"{'='*60}")

        if not self.errors:
            print("\n  ✅ All checks passed. Configuration is valid.\n")
            return

        print(f"\n  Found: {error_count} errors, {warn_count} warnings\n")

        if error_count > 0:
            print("  ERRORS:")
            for e in self.errors:
                if e.severity == "ERROR":
                    print(f"  {e}")
            print()

        if warn_count > 0:
            print("  WARNINGS:")
            for e in self.errors:
                if e.severity == "WARNING":
                    print(f"  {e}")
            print()

        if error_count > 0:
            print("  ❌ VALIDATION FAILED — fix errors before deployment.")
        else:
            print("  ⚠️  VALIDATION PASSED with warnings.")

        print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Validate PLCVS checklist configuration"
    )
    parser.add_argument(
        "config_file",
        nargs="?",
        default="config/checklist_config.yaml",
        help="Path to checklist config YAML",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Validate all YAML files in config/",
    )
    args = parser.parse_args()

    if args.all:
        config_dir = Path("config")
        yaml_files = list(config_dir.glob("**/*.yaml"))
        all_valid = True

        for f in yaml_files:
            validator = ConfigValidator(str(f))
            valid = validator.validate()
            validator.print_report()
            if not valid:
                all_valid = False

        sys.exit(0 if all_valid else 1)
    else:
        validator = ConfigValidator(args.config_file)
        valid = validator.validate()
        validator.print_report()
        sys.exit(0 if valid else 1)


if __name__ == "__main__":
    main()
