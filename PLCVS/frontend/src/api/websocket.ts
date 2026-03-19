/**
 * WebSocket service class — event-driven, auto-reconnect, typed messages.
 *
 * This provides a class-based WebSocket manager that can be used standalone
 * or wrapped by the existing useWebSocket hook. It extracts connection logic
 * so it can be shared across components without re-creating connections.
 */

import {
  WS_URL,
  WS_RECONNECT_INTERVAL,
  WS_MAX_RECONNECT_ATTEMPTS,
  WS_PING_INTERVAL,
} from "../utils/constants";
import type { WSMessage, WSCommand } from "../types";

export type WSEventHandler = (msg: WSMessage) => void;
export type WSStatusHandler = (connected: boolean) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;

  private url: string;
  private maxReconnectAttempts: number;
  private reconnectInterval: number;
  private pingIntervalMs: number;

  // Callbacks
  private onMessage: WSEventHandler | null = null;
  private onStatusChange: WSStatusHandler | null = null;

  constructor(options?: {
    url?: string;
    maxReconnectAttempts?: number;
    reconnectInterval?: number;
    pingInterval?: number;
  }) {
    this.url = options?.url ?? WS_URL;
    this.maxReconnectAttempts = options?.maxReconnectAttempts ?? WS_MAX_RECONNECT_ATTEMPTS;
    this.reconnectInterval = options?.reconnectInterval ?? WS_RECONNECT_INTERVAL;
    this.pingIntervalMs = options?.pingInterval ?? WS_PING_INTERVAL;
  }

  // ── Event registration ─────────────────────────────────

  setMessageHandler(handler: WSEventHandler): void {
    this.onMessage = handler;
  }

  setStatusHandler(handler: WSStatusHandler): void {
    this.onStatusChange = handler;
  }

  // ── Connection state ───────────────────────────────────

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get attempts(): number {
    return this.reconnectAttempts;
  }

  // ── Connect ────────────────────────────────────────────

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.intentionalClose = false;

    try {
      console.log(`[WS-Service] Connecting to ${this.url}...`);
      const ws = new WebSocket(this.url);

      ws.onopen = () => {
        console.log("[WS-Service] Connected");
        this.reconnectAttempts = 0;
        this.onStatusChange?.(true);
        this.startPing(ws);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          this.onMessage?.(msg);
        } catch (err) {
          console.error("[WS-Service] Failed to parse message:", err);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        console.log(`[WS-Service] Disconnected (code: ${event.code})`);
        this.onStatusChange?.(false);
        this.stopPing();

        if (!this.intentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(
            `[WS-Service] Reconnecting in ${this.reconnectInterval}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
          );
          this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectInterval);
        }
      };

      ws.onerror = (error: Event) => {
        console.error("[WS-Service] Error:", error);
      };

      this.ws = ws;
    } catch (err) {
      console.error("[WS-Service] Connection failed:", err);
    }
  }

  // ── Disconnect ─────────────────────────────────────────

  disconnect(): void {
    this.intentionalClose = true;
    this.stopPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.onStatusChange?.(false);
  }

  // ── Send ───────────────────────────────────────────────

  send(cmd: WSCommand): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
      return true;
    }
    console.warn("[WS-Service] Cannot send — not connected");
    return false;
  }

  // ── Ping/Pong ──────────────────────────────────────────

  private startPing(ws: WebSocket): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "PING" }));
      }
    }, this.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ── Cleanup ────────────────────────────────────────────

  destroy(): void {
    this.disconnect();
    this.onMessage = null;
    this.onStatusChange = null;
  }
}

/**
 * Singleton WebSocket service instance.
 * Import and use across the application for a single shared connection.
 */
export const wsService = new WebSocketService();
export default wsService;
