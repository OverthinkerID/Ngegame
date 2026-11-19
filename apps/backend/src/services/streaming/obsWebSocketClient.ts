import crypto from 'node:crypto';
import { WebSocket } from 'ws';

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

export class ObsWebSocketClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private pending = new Map<
    string,
    { resolve: (data: Record<string, unknown>) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  public isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public async connect(url: string, password?: string): Promise<void> {
    await this.disconnect();

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error(`Timeout connecting to OBS WebSocket at ${url}`));
      }, 4000);

      ws.on('error', (err) => {
        clearTimeout(timeout);
        this.connected = false;
        reject(err);
      });

      ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        for (const [id, req] of this.pending.entries()) {
          clearTimeout(req.timer);
          req.reject(new Error('OBS WebSocket connection closed'));
          this.pending.delete(id);
        }
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf8')) as { op: number; d?: unknown };

        // op 0: Hello
        if (msg.op === 0) {
          const hello = msg as ObsHelloMessage;
          let authString: string | undefined;
          if (hello.d.authentication && password) {
            const secret = crypto
              .createHash('sha256')
              .update(password + hello.d.authentication.salt)
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
                rpcVersion: 1,
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
          resolve();
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
      }, 4000);

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

  public async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}
