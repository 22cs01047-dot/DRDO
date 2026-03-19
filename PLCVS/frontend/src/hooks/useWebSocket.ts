/**
 * WebSocket hook — manages connection lifecycle and message dispatching.
 * FIXES: stale closure on reconnectAttempts via ref.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useSessionStore } from "../store/sessionStore";
import {
  WS_URL,
  WS_RECONNECT_INTERVAL,
  WS_MAX_RECONNECT_ATTEMPTS,
  WS_PING_INTERVAL,
} from "../utils/constants";
import { playAlertBeep } from "../utils/helpers";
import { getHealth } from "../api/health";
import type {
  WSMessage,
  WSCommand,
  WSChecklistUpdateMessage,
  WSTranscriptionMessage,
  WSAlertMessage,
  WSProgressMessage,
  WSAudioLevelMessage,
  WSSystemStatusMessage,
} from "../types";

interface UseWebSocketReturn {
  isConnected: boolean;
  reconnectAttempts: number;
  sendCommand: (cmd: WSCommand) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // FIX: use ref for reconnect counter to avoid stale closure in ws.onclose
  const reconnectAttemptsRef = useRef(0);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const {
    setWsConnected,
    setSystemReady,
    setSessionStatus,
    setLastSessionAck,
    handleChecklistUpdate,
    handleTranscription,
    handleAlert,
    handleProgressUpdate,
    handleAudioLevel,
  } = useSessionStore();

  const isConnected = useSessionStore((s) => s.wsConnected);

  // ── Message Router ─────────────────────────────────────

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "CHECKLIST_UPDATE":
            handleChecklistUpdate(msg as WSChecklistUpdateMessage);
            break;
          case "TRANSCRIPTION":
            handleTranscription(msg as WSTranscriptionMessage);
            break;
          case "ALERT": {
            const alertMsg = msg as WSAlertMessage;
            handleAlert(alertMsg);
            playAlertBeep(alertMsg.severity);
            break;
          }
          case "PROGRESS_UPDATE":
            handleProgressUpdate(msg as WSProgressMessage);
            break;
          case "AUDIO_LEVEL":
            handleAudioLevel(msg as WSAudioLevelMessage);
            break;
          case "SESSION_STARTED":
            setSessionStatus("RUNNING");
            setLastSessionAck({ type: "STARTED", timestamp: msg.timestamp || new Date().toISOString() });
            break;
          case "SESSION_STOPPED":
            setSessionStatus("COMPLETED");
            setLastSessionAck({ type: "STOPPED", timestamp: msg.timestamp || new Date().toISOString() });
            break;
          case "SESSION_PAUSED":
            setSessionStatus("PAUSED");
            setLastSessionAck({ type: "PAUSED", timestamp: msg.timestamp || new Date().toISOString() });
            break;
          case "SESSION_RESUMED":
            setSessionStatus("RUNNING");
            setLastSessionAck({ type: "RESUMED", timestamp: msg.timestamp || new Date().toISOString() });
            break;
          case "SYSTEM_STATUS": {
            const status = msg as WSSystemStatusMessage;
            setSystemReady(status.sttReady && status.nlpReady && status.audioReady && status.modelsLoaded);
            break;
          }
          case "PONG":
            break;
          case "ERROR":
            console.error("[WS] Server error:", msg);
            break;
          default:
            console.warn("[WS] Unknown message type:", msg.type);
        }
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    },
    [
      handleChecklistUpdate, handleTranscription, handleAlert,
      handleProgressUpdate, handleAudioLevel, setSessionStatus,
      setLastSessionAck, setSystemReady,
    ]
  );

  // ── Cleanup helpers ────────────────────────────────────

  const clearTimers = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // ── Connect (stable deps — no reconnectAttempts in closure) ──

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log("[WS] Connected");
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);

        // Poll REST health once on connect for system readiness
        getHealth()
          .then((h) => {
            setSystemReady(
              h.status === "healthy" && h.models_loaded.stt && h.models_loaded.semantic
            );
          })
          .catch(() => {
            console.warn("[WS] Health check failed on connect");
          });

        // Start ping
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "PING" }));
          }
        }, WS_PING_INTERVAL);
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log(`[WS] Disconnected (code: ${event.code})`);
        setWsConnected(false);
        clearTimers();

        // FIX: read from ref, not stale state
        if (mountedRef.current && reconnectAttemptsRef.current < WS_MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          setReconnectAttempts(reconnectAttemptsRef.current);
          reconnectTimerRef.current = setTimeout(() => connect(), WS_RECONNECT_INTERVAL);
        }
      };

      ws.onerror = (error) => console.error("[WS] Error:", error);
      wsRef.current = ws;
    } catch (err) {
      console.error("[WS] Connection failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleMessage, setWsConnected, setSystemReady, clearTimers]);

  // ── Disconnect ─────────────────────────────────────────

  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }
    setWsConnected(false);
  }, [clearTimers, setWsConnected]);

  // ── Send Command ───────────────────────────────────────

  const sendCommand = useCallback((cmd: WSCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    } else {
      console.warn("[WS] Cannot send — not connected");
    }
  }, []);

  // ── Lifecycle ──────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isConnected, reconnectAttempts, sendCommand, connect, disconnect };
}