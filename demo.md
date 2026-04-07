# PLCVS Architecture Audit

> **Pre-Launch Checklist Verification System** — DRDO Missile Pre-Launch  
> Audit Date: March 2026 | 

---

## 1. System Overview

PLCVS captures half-duplex military radio audio, converts speech to text via
Faster-Whisper, matches transcriptions to checklist items via NLP, validates
ordering/dependencies via a rules engine, and streams real-time progress to an
Electron + React desktop UI over WebSocket.

### High-Level Data Flow

```
┌─────────────┐    ┌───────────────┐    ┌────────────────┐
│  PyAudio    │───▶│  VAD (Silero) │───▶│ AudioSegmenter │
│  Capture    │    │  + Energy FB  │    │  Speaker Turns  │
└─────────────┘    └───────────────┘    └───────┬────────┘
                                                │ AudioSegment
                                                ▼
                                        ┌───────────────┐
                                        │  Transcriber  │
                                        │  Whisper STT  │
                                        │  PostProcessor│
                                        └───────┬───────┘
                                                │ TranscriptionSegment
                                                ▼
                   ┌────────────────────────────────────────────┐
                   │           ChecklistMatcher                 │
                   │  KeywordExtractor → SemanticMatcher →      │
                   │  IntentClassifier → ContextManager         │
                   └───────────────────┬────────────────────────┘
                                       │ ChecklistMatchResult
                                       ▼
              ┌──────────────────────────────────────────┐
              │          SessionController               │
              │  StateManager · ProgressTracker          │
              │  OrderValidator · DependencyValidator     │
              │  AlertGenerator · SessionLogger          │
              └──────────┬──────────────┬────────────────┘
                         │              │
                    REST API        WebSocket
                   (FastAPI)        (broadcast)
                         │              │
                         ▼              ▼
                  ┌──────────────────────────┐
                  │  Electron + React UI     │
                  │  Vite · Zustand · XYFlow │
                  └──────────────────────────┘
```

---


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