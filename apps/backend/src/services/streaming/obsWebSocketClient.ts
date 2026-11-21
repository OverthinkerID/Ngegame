import crypto from 'node:crypto';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';
import type { ObsDetectionResult } from '@ngegame/shared';

const execFileAsync = promisify(execFile);

interface ObsHelloMessage {
  op: 0;
  d: {
    obsWebSocketVersion: string;
    rpcVersion: number;
    authentication?: {
      challenge: string;
      salt: string;
    };
  };
}

interface ObsEventMessage {
  op: 5;
  d: {
    eventType: string;
    eventIntent: number;
    eventData?: Record<string, unknown>;
  };
}

interface ObsRequestResponseMessage {
  op: 7;
  d: {
    requestType: string;
    requestId: string;
    requestStatus: {
      result: boolean;
      code: number;
      comment?: string;
    };
    responseData?: Record<string, unknown>;
  };
}

export type ObsEventListener = (eventType: string, eventData: Record<string, unknown>) => void;

export class ObsWebSocketClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnecting = false;
  private manualDisconnect = false;
  private lastUrl = 'ws://localhost:4455';
  private lastPassword: string | undefined;
  private obsWebSocketVersion: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private eventListeners = new Set<ObsEventListener>();
  private pending = new Map<
    string,
    { resolve: (data: Record<string, unknown>) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  public isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public isReconnecting(): boolean {
    return this.reconnecting;
  }

  public getObsVersion(): string | null {
    return this.obsWebSocketVersion;
  }

  public onEvent(listener: ObsEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public async detectObs(url = this.lastUrl): Promise<ObsDetectionResult> {
    let host = '127.0.0.1';
    let port = 4455;
    try {
      const parsed = new URL(url);
      host = parsed.hostname || '127.0.0.1';
      port = parsed.port ? Number(parsed.port) : 4455;
    } catch {
      // keep defaults
    }

    let processRunning = false;
    try {
      if (process.platform === 'darwin') {
        const { stdout } = await execFileAsync('pgrep', ['-x', 'OBS'], { timeout: 1500 });
        processRunning = stdout.trim().length > 0;
      } else if (process.platform === 'win32') {
        const { stdout } = await execFileAsync(
          'tasklist',
          ['/FI', 'IMAGENAME eq obs64.exe', '/FO', 'CSV', '/NH'],
          { timeout: 1500 },
        );
        processRunning = stdout.toLowerCase().includes('obs64.exe');
      } else {
        const { stdout } = await execFileAsync('pgrep', ['-x', 'obs'], { timeout: 1500 });
        processRunning = stdout.trim().length > 0;
      }
    } catch {
      processRunning = false;
    }

    const portReachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(900);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });

    return {
      processRunning,
      portReachable,
      host,
      port,
      platform: process.platform,
      detectedAt: new Date().toISOString(),
    };
  }

  public async connect(url: string, password?: string): Promise<void> {
    this.manualDisconnect = false;
    this.lastUrl = url;
    if (password !== undefined) {
      this.lastPassword = password;
    }
    this.clearReconnectTimer();
    await this.disconnectInternal(false);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          reject(new Error(`Timeout connecting to OBS WebSocket at ${url}`));
        }
      }, 4500);

      ws.on('error', (err) => {
        clearTimeout(timeout);
        this.connected = false;
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      ws.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.ws = null;
        for (const [id, req] of this.pending.entries()) {
          clearTimeout(req.timer);
          req.reject(new Error('OBS WebSocket connection closed'));
          this.pending.delete(id);
        }
        if (wasConnected && !this.manualDisconnect) {
          this.scheduleReconnect();
        }
      });

      ws.on('message', (raw) => {
        let msg: { op: number; d?: unknown };
        try {
          msg = JSON.parse(raw.toString('utf8')) as { op: number; d?: unknown };
        } catch {
          return;
        }

        // op 0: Hello
        if (msg.op === 0) {
          const hello = msg as ObsHelloMessage;
          this.obsWebSocketVersion = hello.d.obsWebSocketVersion ?? null;
          let authString: string | undefined;
          if (hello.d.authentication) {
            const pwd = password ?? this.lastPassword ?? '';
            if (!pwd) {
              clearTimeout(timeout);
              if (!settled) {
                settled = true;
                ws.close();
                reject(new Error('OBS WebSocket membutuhkan kata sandi autentikasi'));
              }
              return;
            }
            const secret = crypto
              .createHash('sha256')
              .update(pwd + hello.d.authentication.salt)
              .digest('base64');
            authString = crypto
              .createHash('sha256')
              .update(secret + hello.d.authentication.challenge)
              .digest('base64');
          }

          ws.send(
            JSON.stringify({
              op: 1,
              d: {
                rpcVersion: hello.d.rpcVersion || 1,
                ...(authString ? { authentication: authString } : {}),
              },
            }),
          );
          return;
        }

        // op 2: Identified
        if (msg.op === 2) {
          clearTimeout(timeout);
          this.ws = ws;
          this.connected = true;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        // op 5: Event
        if (msg.op === 5) {
          const ev = msg as ObsEventMessage;
          for (const listener of this.eventListeners) {
            try {
              listener(ev.d.eventType, ev.d.eventData ?? {});
            } catch {
              // ignore listener errors
            }
          }
          return;
        }

        // op 7: RequestResponse
        if (msg.op === 7) {
          const resp = msg as ObsRequestResponseMessage;
          const pendingReq = this.pending.get(resp.d.requestId);
          if (!pendingReq) return;
          clearTimeout(pendingReq.timer);
          this.pending.delete(resp.d.requestId);

          if (!resp.d.requestStatus.result) {
            pendingReq.reject(
              new Error(
                resp.d.requestStatus.comment ??
                  `OBS error code ${resp.d.requestStatus.code}`,
              ),
            );
          } else {
            pendingReq.resolve(resp.d.responseData ?? {});
          }
        }
      });
    });
  }

  public async reconnect(): Promise<void> {
    this.reconnecting = true;
    await this.connect(this.lastUrl, this.lastPassword);
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect || this.reconnectTimer || this.reconnectAttempts >= 5) {
      this.reconnecting = false;
      return;
    }
    this.reconnecting = true;
    this.reconnectAttempts += 1;
    const delayMs = Math.min(15000, 1500 * this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(this.lastUrl, this.lastPassword).catch(() => {
        this.scheduleReconnect();
      });
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public async request(
    requestType: string,
    requestData?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.isConnected() || !this.ws) {
      throw new Error('OBS WebSocket is not connected');
    }

    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OBS request '${requestType}' timed out`));
      }, 4500);

      this.pending.set(requestId, { resolve, reject, timer });

      this.ws?.send(
        JSON.stringify({
          op: 6,
          d: {
            requestType,
            requestId,
            ...(requestData ? { requestData } : {}),
          },
        }),
      );
    });
  }

  private async disconnectInternal(markManual: boolean): Promise<void> {
    if (markManual) {
      this.manualDisconnect = true;
      this.reconnecting = false;
      this.clearReconnectTimer();
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  public async disconnect(): Promise<void> {
    await this.disconnectInternal(true);
  }
}
