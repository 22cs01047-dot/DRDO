# main.py
"""
PLCVS Backend — Main Entry Point

Starts the FastAPI server with all modules initialized.

Usage:
    python main.py
    python main.py --config ../config/system_config.yaml
    python main.py --port 8765 --host 0.0.0.0
"""

import os
import sys
import argparse
import logging
import asyncio
from pathlib import Path

import uvicorn
import yaml
from dotenv import load_dotenv

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

# Load environment variables
load_dotenv(PROJECT_ROOT / ".env")


def setup_logging(log_level: str = "INFO", log_dir: str = None) -> None:
    """Configure application logging."""
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s"
    )
    date_format = "%Y-%m-%d %H:%M:%S"

    handlers = [logging.StreamHandler(sys.stdout)]

    if log_dir:
        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(
            log_path / "plcvs_backend.log",
            encoding="utf-8",
        )
        file_handler.setFormatter(logging.Formatter(log_format, date_format))
        handlers.append(file_handler)

    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format=log_format,
        datefmt=date_format,
        handlers=handlers,
    )

    # Suppress noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("faster_whisper").setLevel(logging.WARNING)
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)


def load_system_config(config_path: str) -> dict:
    """Load system configuration from YAML."""
    path = Path(config_path)
    if not path.exists():
        logging.warning(f"Config not found: {path}. Using defaults.")
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def create_directories(config: dict) -> None:
    """Create required data directories."""
    paths = config.get("paths", {})
    for key in ["data_dir", "log_dir", "sessions_dir", "audio_recordings_dir"]:
        dir_path = paths.get(key)
        if dir_path:
            resolved = Path(PROJECT_ROOT / "backend" / dir_path)
            resolved.mkdir(parents=True, exist_ok=True)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="PLCVS Backend Server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--config",
        default=str(PROJECT_ROOT / "config" / "system_config.yaml"),
        help="Path to system_config.yaml",
    )
    parser.add_argument("--host", default=None, help="Server host")
    parser.add_argument("--port", type=int, default=None, help="Server port")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default=None,
        help="Logging level",
    )
    return parser.parse_args()


def main() -> None:
    """Main entry point."""
    args = parse_args()

    # Load config
    system_config = load_system_config(args.config)
    server_config = system_config.get("server", {})

    # Resolve settings (CLI > env > config > defaults)
    host = (
        args.host
        or os.getenv("PLCVS_HOST")
        or server_config.get("host", "127.0.0.1")
    )
    port = (
        args.port
        or int(os.getenv("PLCVS_PORT", 0))
        or server_config.get("port", 8765)
    )
    debug = args.debug or server_config.get("debug", False)
    log_level = (
        args.log_level
        or os.getenv("PLCVS_LOG_LEVEL")
        or server_config.get("log_level", "INFO")
    )
    log_dir = system_config.get("paths", {}).get("log_dir", "../data/logs")

    # Setup
    setup_logging(log_level, str(PROJECT_ROOT / "backend" / log_dir))
    create_directories(system_config)

    logger = logging.getLogger("plcvs.main")
    logger.info("=" * 60)
    logger.info("  PLCVS — Pre-Launch Checklist Verification System")
    logger.info("=" * 60)
    logger.info(f"  Host:      {host}")
    logger.info(f"  Port:      {port}")
    logger.info(f"  Debug:     {debug}")
    logger.info(f"  Log Level: {log_level}")
    logger.info(f"  Config:    {args.config}")
    logger.info("=" * 60)

    # Store config in environment for access by FastAPI app
    os.environ["PLCVS_SYSTEM_CONFIG_PATH"] = args.config
    os.environ["PLCVS_CHECKLIST_CONFIG_PATH"] = str(
        PROJECT_ROOT / "config" / "checklist_config.yaml"
    )
    os.environ["PLCVS_VOCABULARY_PATH"] = str(
        PROJECT_ROOT / "config" / "vocabulary" / "military_terms.yaml"
    )

    # Start uvicorn
    uvicorn.run(
        "api.app:app",
        host=host,
        port=port,
        reload=debug,
        log_level=log_level.lower(),
        ws_max_size=16 * 1024 * 1024,  # 16MB WebSocket messages
        timeout_keep_alive=300,
    )

if __name__ == "__main__":
    main()

