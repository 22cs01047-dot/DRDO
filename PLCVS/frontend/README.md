# PLCVS Frontend

> **Pre-Launch Checklist Verification System** — Desktop UI  
> Electron + React 19 + TypeScript + Tailwind CSS + Zustand

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI Framework | React | 19.2 |
| Language | TypeScript | 5.3 |
| Build Tool | Vite | 5.x |
| Styling | Tailwind CSS | 3.4 |
| State Management | Zustand | 5.x |
| Desktop Shell | Electron | 28.x |
| Icons | Lucide React | 0.475 |

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- Backend running at `http://127.0.0.1:8765` (see `backend/readme_info.md`)

### Install & Run

```bash
# Install dependencies
cd frontend
npm install

# Start development server (browser mode)
npm run dev
# → http://localhost:5173

# Start with Electron
npm run electron:dev
```

### Build

```bash
# TypeScript check
npx tsc --noEmit

# Production build
npm run build

# Electron production build
npm run electron:build
```

### Environment Variables

Create `.env` in the frontend root (optional — defaults shown):

```env
VITE_API_URL=http://localhost:8765/api/v1
VITE_WS_URL=ws://localhost:8765/ws
```

---

## Project Structure

```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Root component — layout + routing
├── index.css                   # Tailwind imports + custom styles
├── vite-env.d.ts               # Vite env type declarations
│
├── api/                        # ── API Integration Layer ──
│   ├── client.ts               # Base ApiClient (GET/POST/upload, error handling)
│   ├── types.ts                # TypeScript types for all 12 endpoint req/res schemas
│   ├── health.ts               # GET /health
│   ├── checklist.ts            # GET /checklist/config, /checklist/snapshot
│   ├── session.ts              # POST /session/start|stop, GET /session/progress|state|alerts,
│   │                           #   POST /session/override, GET /sessions/history
│   ├── audio.ts                # GET /devices, POST /transcribe/file
│   ├── websocket.ts            # WebSocketService class (reconnection, typed events)
│   └── index.ts                # Barrel export
│
├── hooks/                      # ── React Hooks ──
│   ├── useSession.ts           # Session lifecycle (start/stop/pause/resume/override)
│   ├── useWebSocket.ts         # WebSocket connection + message routing to store
│   ├── useAudio.ts             # Audio playback of recorded segments
│   ├── useHealth.ts            # Health polling + system readiness
│   ├── useChecklist.ts         # Checklist config + snapshot loading
│   ├── useSessionHistory.ts    # Past session records
│   ├── useAudioDevices.ts      # Audio input device listing
│   └── useTranscribeFile.ts    # Audio file upload + transcription
│
├── store/                      # ── State Management (Zustand) ──
│   └── sessionStore.ts         # Single store: session, stages, progress, alerts, transcriptions
│
├── components/                 # ── UI Components ──
│   ├── Header.tsx              # Top bar — mission info, status, session controls
│   ├── DependencyGraph.tsx     # SVG stage dependency flow diagram
│   ├── ProgressBar.tsx         # Overall progress + stat chips
│   ├── StagePanel.tsx          # Stage card with embedded checklist items
│   ├── ChecklistItem.tsx       # Individual checklist item row with override menu
│   ├── TranscriptFeed.tsx      # Live transcription feed with replay
│   ├── AlertPanel.tsx          # Alert list with severity badges + ACK
│   ├── AudioMonitor.tsx        # RMS/peak audio level meters
│   ├── ManualOverride.tsx      # Form-based manual override panel
│   ├── SessionReport.tsx       # Post-session report modal
│   └── ApiTestDashboard.tsx    # Developer tool — test all 12 endpoints interactively
│
├── types/                      # ── Shared Types ──
│   └── index.ts                # UI-level types (Session, Stage, Alert, WS messages, etc.)
│
└── utils/                      # ── Utilities ──
    ├── constants.ts            # URLs, colors, icons, thresholds
    └── helpers.ts              # Formatting, progress calc, audio beep, etc.
```

---

## API Integration

The frontend connects to all 12 backend REST endpoints and 1 WebSocket:

| # | Endpoint | Method | Frontend Module |
|---|----------|--------|----------------|
| 1 | `/api/v1/health` | GET | `api/health.ts` → `useHealth` |
| 2 | `/api/v1/checklist/config` | GET | `api/checklist.ts` → `useSession.loadConfig` |
| 3 | `/api/v1/checklist/snapshot` | GET | `api/checklist.ts` → `useChecklist` |
| 4 | `/api/v1/session/start` | POST | `api/session.ts` → `useSession.startSession` |
| 5 | `/api/v1/session/stop` | POST | `api/session.ts` → `useSession.stopSession` |
| 6 | `/api/v1/session/progress` | GET | `api/session.ts` → `useSession` |
| 7 | `/api/v1/session/state` | GET | `api/session.ts` → `useSession` |
| 8 | `/api/v1/session/alerts` | GET | `api/session.ts` → `useSession` |
| 9 | `/api/v1/session/override` | POST | `api/session.ts` → `useSession.manualOverride` |
| 10 | `/api/v1/devices` | GET | `api/audio.ts` → `useAudioDevices` |
| 11 | `/api/v1/transcribe/file` | POST | `api/audio.ts` → `useTranscribeFile` |
| 12 | `/api/v1/sessions/history` | GET | `api/session.ts` → `useSessionHistory` |
| 13 | `ws://localhost:8765/ws` | WS | `hooks/useWebSocket.ts` (11 message types) |

### Dual REST + WebSocket paths

`startSession`, `stopSession`, and `manualOverride` attempt the REST endpoint first and fall back to WebSocket command if REST fails, ensuring robustness in degraded conditions.

### API Test Dashboard

Click **🧪 API Test Dashboard** in the right sidebar to open an interactive panel that exercises every endpoint with one click, showing responses, latency, and errors.

---

## WebSocket Messages

### Client → Server

| Type | Description |
|------|-------------|
| `START_SESSION` | Begin verification session |
| `STOP_SESSION` | End active session |
| `MANUAL_OVERRIDE` | Override checklist item status |
| `PING` | Heartbeat (auto, every 15s) |

### Server → Client

| Type | Handler |
|------|---------|
| `TRANSCRIPTION` | → `store.handleTranscription` |
| `CHECKLIST_UPDATE` | → `store.handleChecklistUpdate` |
| `ALERT` | → `store.handleAlert` + audio beep |
| `PROGRESS_UPDATE` | → `store.handleProgressUpdate` |
| `AUDIO_LEVEL` | → `store.handleAudioLevel` |
| `SESSION_STARTED` | → `store.setSessionStatus("RUNNING")` |
| `SESSION_STOPPED` | → `store.setSessionStatus("COMPLETED")` |
| `SYSTEM_STATUS` | → `store.setSystemReady(...)` |
| `PONG` | Heartbeat ACK |
| `ERROR` | Console error |
| `SESSION_PAUSED` | → `store.setSessionStatus("PAUSED")` |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview production build locally |
| `npm run electron:dev` | Vite + Electron concurrent dev |
| `npm run electron:build` | Production Electron build |
| `npm run lint` | ESLint check |
