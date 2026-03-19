# PLCVS Frontend ↔ Backend Integration Audit

> Generated during Phase 5 of the PLCVS audit & refactor project.
> Maps every backend endpoint to its frontend implementation status.

---

## Summary

| Metric | Count |
|--------|-------|
| Total Backend Endpoints (REST) | 12 |
| Total Backend Endpoints (WebSocket) | 1 (11 message types) |
| Frontend — Previously Connected | 2 (partial) |
| Frontend — Now Fully Connected | 12 REST + 1 WS (all message types) |
| New Files Created | 12 |
| Files Modified | 4 |

---

## REST Endpoint Mapping

| # | Endpoint | Method | Backend Status | Frontend Status (Before) | Frontend Status (After) | File |
|---|----------|--------|---------------|-------------------------|------------------------|------|
| 1 | `/api/v1/health` | GET | ✅ Working | ❌ No integration | ✅ `api/health.ts` + `useHealth` hook | `src/api/health.ts` |
| 2 | `/api/v1/checklist/config` | GET | ✅ Working | ⚠️ Partial (raw `fetch` in `useSession.loadConfig`) | ✅ `api/checklist.ts` + hook updated | `src/api/checklist.ts` |
| 3 | `/api/v1/checklist/snapshot` | GET | ✅ Working | ❌ No integration | ✅ `api/checklist.ts` + `useChecklist` hook | `src/api/checklist.ts` |
| 4 | `/api/v1/session/start` | POST | ✅ Working | ⚠️ WS-only (no REST call) | ✅ `api/session.ts` + dual WS+REST | `src/api/session.ts` |
| 5 | `/api/v1/session/stop` | POST | ✅ Working | ⚠️ WS-only | ✅ `api/session.ts` | `src/api/session.ts` |
| 6 | `/api/v1/session/progress` | GET | ✅ Working | ❌ No integration | ✅ `api/session.ts` + polling in hook | `src/api/session.ts` |
| 7 | `/api/v1/session/state` | GET | ✅ Working | ❌ No integration | ✅ `api/session.ts` | `src/api/session.ts` |
| 8 | `/api/v1/session/alerts` | GET | ✅ Working | ❌ No integration | ✅ `api/session.ts` | `src/api/session.ts` |
| 9 | `/api/v1/session/override` | POST | ✅ Working | ⚠️ WS-only | ✅ `api/session.ts` + dual WS+REST | `src/api/session.ts` |
| 10 | `/api/v1/devices` | GET | ✅ Working | ❌ No integration | ✅ `api/audio.ts` + `useAudioDevices` hook | `src/api/audio.ts` |
| 11 | `/api/v1/transcribe/file` | POST | ✅ Working | ❌ No integration | ✅ `api/audio.ts` + file upload | `src/api/audio.ts` |
| 12 | `/api/v1/sessions/history` | GET | ✅ Working | ❌ No integration | ✅ `api/session.ts` + `useSessionHistory` hook | `src/api/session.ts` |

---

## WebSocket Message Mapping

### Client → Server (Outgoing)

| # | Message Type | Backend Handler | Frontend Status (Before) | Frontend Status (After) |
|---|-------------|----------------|-------------------------|------------------------|
| 1 | `START_SESSION` | `_handle_start_session` | ✅ Working | ✅ Via `useWebSocket.sendCommand` |
| 2 | `STOP_SESSION` | `_handle_stop_session` | ✅ Working | ✅ Via `useWebSocket.sendCommand` |
| 3 | `MANUAL_OVERRIDE` | `_handle_manual_override` | ✅ Working | ✅ Via `useWebSocket.sendCommand` |
| 4 | `PING` | Returns `PONG` | ✅ Working | ✅ Auto-ping interval |

### Server → Client (Incoming)

| # | Message Type | Frontend Handler (Before) | Frontend Handler (After) |
|---|-------------|--------------------------|-------------------------|
| 1 | `TRANSCRIPTION` | ✅ `handleTranscription` | ✅ Unchanged (working) |
| 2 | `CHECKLIST_UPDATE` | ✅ `handleChecklistUpdate` | ✅ Unchanged (working) |
| 3 | `ALERT` | ✅ `handleAlert` + beep | ✅ Unchanged (working) |
| 4 | `PROGRESS_UPDATE` | ✅ `handleProgressUpdate` | ✅ Unchanged (working) |
| 5 | `AUDIO_LEVEL` | ✅ `handleAudioLevel` | ✅ Unchanged (working) |
| 6 | `SESSION_STARTED` | ✅ `setSessionStatus("RUNNING")` | ✅ Unchanged (working) |
| 7 | `SESSION_STOPPED` | ✅ `setSessionStatus("COMPLETED")` | ✅ Unchanged (working) |
| 8 | `SYSTEM_STATUS` | ✅ `setSystemReady(...)` | ✅ Unchanged (working) |
| 9 | `PONG` | ✅ Heartbeat ACK | ✅ Unchanged (working) |
| 10 | `ERROR` | ✅ `console.error` | ✅ Enhanced — toast support |
| 11 | `SESSION_PAUSED` | ✅ `setSessionStatus("PAUSED")` | ✅ Unchanged (working) |

---

## Architecture — Before vs After

### Before (Existing Frontend)
```
useSession.ts
├── loadConfig() → raw fetch("/api/v1/config") ← WRONG PATH (/config vs /checklist/config)
├── startSession() → WS command only (no REST fallback)
├── stopSession() → WS command only
└── manualOverride() → WS command + optimistic local update

useWebSocket.ts → Raw WebSocket with reconnection
useAudio.ts → Audio playback only

No API service layer. No typed responses. No error handling layer.
10 of 12 endpoints had ZERO frontend integration.
```

### After (New Integration Layer)
```
src/api/
├── client.ts          — Typed ApiClient class (GET/POST/upload, error handling, interceptors)
├── types.ts           — Full TypeScript types for all 12 endpoints (req + res)
├── health.ts          — getHealth()
├── checklist.ts       — getChecklistConfig(), getChecklistSnapshot()
├── session.ts         — startSession(), stopSession(), getProgress(), getState(),
│                        getAlerts(), manualOverride(), getSessionHistory()
├── audio.ts           — getAudioDevices(), transcribeFile()
├── websocket.ts       — WebSocketService class (event-driven, auto-reconnect, typed)
└── index.ts           — Barrel export

src/hooks/
├── useSession.ts      — Updated to use api layer with REST+WS dual path
├── useWebSocket.ts    — Updated to use WebSocketService
├── useAudio.ts        — Unchanged (already working)
├── useHealth.ts       — NEW — polls /health, exposes system readiness
├── useChecklist.ts    — NEW — loads config + snapshot via REST
├── useSessionHistory.ts — NEW — fetches past sessions
└── useAudioDevices.ts — NEW — lists audio input devices

src/components/
└── ApiTestDashboard.tsx — NEW — Interactive dashboard to test all 12 endpoints
```

---

## Issues Found & Fixed

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `loadConfig()` fetches `/api/v1/config` but backend serves `/api/v1/checklist/config` | 🔴 Critical | Fixed path in `useSession.ts` |
| 2 | No REST fallback for session start/stop — WS-only is fragile | 🟡 Moderate | Added dual REST+WS path |
| 3 | No typed API client — all fetches are raw with no error handling | 🟡 Moderate | Created `ApiClient` class |
| 4 | No TypeScript types for API responses | 🟡 Moderate | Created `api/types.ts` |
| 5 | 10/12 REST endpoints have zero frontend integration | 🟡 Moderate | All wired up |
| 6 | No health check integration — `systemReady` only from WS | 🟡 Moderate | Added `useHealth` hook |
| 7 | Manual override only goes via WS, no REST backup | 🟡 Moderate | Dual path added |
| 8 | No session history UI | 🔵 Minor | Hook + dashboard |
| 9 | No audio device listing | 🔵 Minor | Hook + dashboard |
| 10 | No file transcription UI | 🔵 Minor | Dashboard |

---

## Verification Checklist

- [x] All 12 REST endpoints have TypeScript client functions
- [x] All client functions have typed request/response interfaces
- [x] WebSocket service handles all 11 message types
- [x] Error handling on all API calls (try/catch + typed errors)
- [x] Loading states on all async operations
- [x] Hooks use centralized API layer (no raw fetch)
- [x] API Test Dashboard can exercise every endpoint
- [x] Existing UI components unchanged (backward compatible)
- [x] Constants (URLs) remain in single constants.ts
