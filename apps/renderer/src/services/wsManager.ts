import { BACKEND_WS_URL } from './backendService.js';

export type WsConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WsEventMessage {
  type: string;
  payload?: unknown;
  timestamp?: string;
  message?: string;
}

type EventListener = (msg: WsEventMessage) => void;
type StatusListener = (status: WsConnectionStatus) => void;

class CentralizedWebSocketManager {
  private ws: WebSocket | null = null;
  private url: string = BACKEND_WS_URL;
  private status: WsConnectionStatus = 'disconnected';
  private retryTimer: number | null = null;
  private attempt = 0;
  private refCount = 0;
  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private resyncListeners = new Set<() => void>();

  public getStatus(): WsConnectionStatus {
    return this.status;
  }

  private setStatus(next: WsConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) {
      try {
        listener(next);
      } catch {
        // ignore listener errors
      }
    }
  }

  public retain(wsUrl?: string): () => void {
    if (wsUrl && wsUrl !== this.url) {
      this.url = wsUrl;
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
    this.refCount += 1;
    this.ensureConnected();

    return () => {
      this.refCount = Math.max(0, this.refCount - 1);
      if (this.refCount === 0) {
        this.disconnect();
      }
    };
  }

  private ensureConnected(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.setStatus(this.attempt > 0 ? 'reconnecting' : 'connecting');

    try {
      const socket = new WebSocket(this.url);
      this.ws = socket;

      socket.onopen = () => {
        const wasReconnect = this.attempt > 0;
        this.attempt = 0;
        this.setStatus('connected');
        if (wasReconnect) {
          for (const resync of this.resyncListeners) {
            try {
              resync();
            } catch {
              // ignore
            }
          }
        }
      };

      socket.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as WsEventMessage;
          for (const listener of this.eventListeners) {
            try {
              listener(msg);
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore non-JSON payload
        }
      };

      socket.onclose = () => {
        if (this.ws === socket) {
          this.ws = null;
        }
        if (this.refCount <= 0) {
          this.setStatus('disconnected');
          return;
        }
        this.attempt += 1;
        this.setStatus('reconnecting');
        const delayMs = Math.min(1000 * Math.pow(1.6, Math.min(this.attempt, 6)), 15000);
        this.retryTimer = window.setTimeout(() => {
          this.ensureConnected();
        }, delayMs);
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch {
      this.setStatus('reconnecting');
    }
  }

  public disconnect(): void {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.attempt = 0;
    this.setStatus('disconnected');
  }

  public subscribe(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public onReconnectResync(listener: () => void): () => void {
    this.resyncListeners.add(listener);
    return () => {
      this.resyncListeners.delete(listener);
    };
  }
}

export const wsManager = new CentralizedWebSocketManager();
