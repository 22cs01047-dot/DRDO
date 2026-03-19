# config_loader.py
"""
Checklist Configuration Loader

Loads, validates, and provides access to the mission
checklist configuration from YAML files.
"""

import logging
from pathlib import Path
from typing import Optional, List, Dict
from dataclasses import dataclass, field

import yaml

logger = logging.getLogger(__name__)


@dataclass
class ChecklistItemConfig:
    """Configuration for a single checklist item."""
    id: str
    name: str
    keywords: List[str]
    expected_responses: Dict[str, List[str]]
    mandatory: bool = True
    order_in_stage: int = 0


@dataclass
class StageConfig:
    """Configuration for a stage."""
    id: str
    name: str
    order: int
    dependency: Optional[str]
    type: str  # STRICT | SOFT | PARALLEL | INDEPENDENT
    description: str
    items: List[ChecklistItemConfig] = field(default_factory=list)


@dataclass
class RuleConfig:
    """Configuration for a rule."""
    id: str
    description: str
    type: str
    severity: str = "WARNING"
    params: Dict = field(default_factory=dict)


@dataclass
class ChecklistConfig:
    """Complete checklist configuration."""
    mission_id: str
    mission_name: str
    version: str
    stages: List[StageConfig]
    rules: List[RuleConfig]
    raw_config: Dict

    def get_stage(self, stage_id: str) -> Optional[StageConfig]:
        """Get stage by ID."""
        for stage in self.stages:
            if stage.id == stage_id:
                return stage
        return None

    def get_item(self, item_id: str) -> Optional[ChecklistItemConfig]:
        """Get checklist item by ID."""
        for stage in self.stages:
            for item in stage.items:
                if item.id == item_id:
                    return item
        return None

    def get_stage_for_item(self, item_id: str) -> Optional[StageConfig]:
        """Get the stage containing a specific item."""
        for stage in self.stages:
            for item in stage.items:
                if item.id == item_id:
                    return stage
        return None

    @property
    def total_items(self) -> int:
        return sum(len(s.items) for s in self.stages)

    @property
    def total_mandatory_items(self) -> int:
        return sum(
            1 for s in self.stages for i in s.items if i.mandatory
        )

    @property
    def stage_ids(self) -> List[str]:
        return [s.id for s in sorted(self.stages, key=lambda s: s.order)]


def load_checklist_config(config_path: str) -> ChecklistConfig:
    """
    Load and validate checklist configuration from YAML.

    Args:
        config_path: Path to checklist_config.yaml

    Returns:
        Validated ChecklistConfig object.

    Raises:
        FileNotFoundError: If config file doesn't exist.
        ValueError: If config is invalid.
    """
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Checklist config not found: {path}")

    logger.info(f"Loading checklist config: {path}")

    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    if not raw:
        raise ValueError("Empty checklist configuration file.")

    # Parse mission info
    mission = raw.get("mission", {})
    mission_id = mission.get("id", "UNKNOWN")
    mission_name = mission.get("name", "Unknown Mission")
    version = mission.get("version", "0.0")

    # Parse stages
    stages = []
    raw_stages = raw.get("stages", [])

    for stage_data in raw_stages:
        items = []
        for item_data in stage_data.get("checklist_items", []):
            items.append(ChecklistItemConfig(
                id=item_data["id"],
                name=item_data["name"],
                keywords=item_data.get("keywords", []),
                expected_responses=item_data.get("expected_responses", {}),
                mandatory=item_data.get("mandatory", True),
                order_in_stage=item_data.get("order_in_stage", 0),
            ))

        stages.append(StageConfig(
            id=stage_data["id"],
            name=stage_data["name"],
            order=stage_data.get("order", 0),
            dependency=stage_data.get("dependency"),
            type=stage_data.get("type", "INDEPENDENT"),
            description=stage_data.get("description", ""),
            items=items,
        ))

    # Parse rules
    rules = []
    for rule_data in raw.get("rules", []):
        rules.append(RuleConfig(
            id=rule_data["id"],
            description=rule_data.get("description", ""),
            type=rule_data.get("type", ""),
            severity=rule_data.get("severity", "WARNING"),
            params=rule_data.get("params", {}),
        ))

    config = ChecklistConfig(
        mission_id=mission_id,
        mission_name=mission_name,
        version=version,
        stages=sorted(stages, key=lambda s: s.order),
        rules=rules,
        raw_config=raw,
    )

    # Validate
    _validate_config(config)

    logger.info(
        f"Checklist loaded: '{mission_name}' (v{version}) — "
        f"{len(stages)} stages, {config.total_items} items, "
        f"{len(rules)} rules"
    )

    return config


def _validate_config(config: ChecklistConfig) -> None:
    """Validate the loaded configuration."""
    errors = []

    # Check for duplicate IDs
    stage_ids = set()
    item_ids = set()

    for stage in config.stages:
        if stage.id in stage_ids:
            errors.append(f"Duplicate stage ID: {stage.id}")
        stage_ids.add(stage.id)

        for item in stage.items:
            if item.id in item_ids:
                errors.append(f"Duplicate item ID: {item.id}")
            item_ids.add(item.id)

            if not item.keywords:
                errors.append(
                    f"Item '{item.id}' ({item.name}) has no keywords"
                )

    # Check dependency references
    for stage in config.stages:
        if stage.dependency and stage.dependency not in stage_ids:
            errors.append(
                f"Stage '{stage.id}' depends on non-existent "
                f"stage '{stage.dependency}'"
            )

    # Check for circular dependencies
    _check_circular_deps(config.stages, errors)

    if errors:
        for err in errors:
            logger.error(f"Config validation error: {err}")
        raise ValueError(
            f"Checklist configuration has {len(errors)} errors: "
            + "; ".join(errors)
        )

    logger.info("Checklist configuration validated successfully.")


def _check_circular_deps(stages: List[StageConfig], errors: List[str]):
    """Check for circular dependencies between stages."""
    dep_map = {s.id: s.dependency for s in stages}

    for stage in stages:
        visited = set()
        current = stage.id

        while current:
            if current in visited:
                errors.append(
                    f"Circular dependency detected involving stage '{current}'"
                )
                break
            visited.add(current)
            current = dep_map.get(current)
