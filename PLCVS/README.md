# PLCVS — Pre-Launch Checklist Verification System

> **DRDO** | Chandipur Base Station | Abdul Kalam Island Launch Operations

## Overview

PLCVS automates the monitoring and verification of missile pre-launch
checklist procedures by processing half-duplex radio communication audio
in real-time.

### What it does

1. **Captures** half-duplex radio audio in real-time
2. **Converts** speech to text using Faster-Whisper (runs locally)
3. **Matches** transcribed text to predefined checklist items via NLP
4. **Validates** stage dependencies and ordering via Rules Engine
5. **Displays** real-time progress on a desktop UI (Electron + React)
6. **Alerts** operators when items are missed, out-of-order, or failed

## Key Constraints

- **Fully Offline** — No internet during operation
- **One-time setup** — Internet only for initial model download
- **Low latency** — Audio → UI update < 5 seconds
- **Defense-grade** — When in doubt, flag for human review

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Backend    | Python 3.10+, FastAPI, AsyncIO          |
| Frontend   | React 18 + TypeScript, Electron         |
| STT        | Faster-Whisper (large-v3-turbo)         |
| NLP        | spaCy, Sentence-Transformers            |
| LLM        | Llama 3.1 8B (Q4, local)               |
| VAD        | Silero VAD                              |
| Database   | SQLite                                  |
| Config     | YAML                                    |

## Quick Start

### 1. Clone & Setup Environment

```bash
git clone <repo-url>
cd PLCVS
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows
pip install -r backend/requirements.txt
2. Download Models (requires internet — one time only)
Bash

python scripts/setup_models.py --all
3. Validate Configuration
Bash

python scripts/validate_config.py
4. Start Backend
Bash

cd backend
python main.py
5. Start Frontend
Bash

cd frontend
npm install
npm run dev        # Development
npm run electron   # Desktop app
Project Structure
text

PLCVS/
├── config/          # Mission checklist & system configuration
├── backend/         # Python backend (FastAPI + AI pipeline)
├── frontend/        # React + Electron desktop UI
├── models/          # AI models (downloaded, gitignored)
├── scripts/         # Setup and utility scripts
├── data/            # Session data, audio recordings
├── docs/            # Documentation (SRS, Design, Manual)
└── docker/          # Containerization
Configuration
Edit config/checklist_config.yaml to define your mission checklist.
Edit config/system_config.yaml for system-level settings.

License
RESTRICTED — DRDO Internal Use Only

Classification
CONFIDENTIAL — Do not distribute outside authorized personnel.
