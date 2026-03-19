"""Root conftest — ensures backend packages are importable by tests."""

import sys
from pathlib import Path

# Add the backend directory to sys.path so tests can import packages
# like `from rules_engine.alert_generator import ...`
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
