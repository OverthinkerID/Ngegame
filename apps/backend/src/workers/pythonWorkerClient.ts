import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import {
  AppError,
  ErrorCode,
  type ComponentStatus,
  type WorkerCommand,
  type WorkerRequest,
  type WorkerResponse,
} from '@ngegame/shared';
import { Logger } from '../utils/logger.js';

interface PendingRequest {
  resolve: (response: WorkerResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export interface PythonWorkerOptions {
  pythonBin: string;
  workerScriptPath: string;
  timeoutMs?: number;
}

export class PythonWorkerClient {
  private readonly pythonBin: string;
  private readonly workerScriptPath: string;
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();
  private rl: readline.Interface | null = null;

  constructor(options: PythonWorkerOptions, logger = new Logger('python-worker')) {
    this.pythonBin = options.pythonBin;
    this.workerScriptPath = options.workerScriptPath;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.logger = logger;
  }

  public isRunning(): boolean {
    return this.process !== null && !this.process.killed && this.process.exitCode === null;
  }

  public start(): void {
    if (this.isRunning()) {
      return;
    }

    const workerDir = path.dirname(this.workerScriptPath);
    this.logger.info('Starting Python worker', {
      pythonBin: this.pythonBin,
      script: this.workerScriptPath,
    });

    const child = spawn(this.pythonBin, [this.workerScriptPath], {
      cwd: workerDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    this.process = child;

    this.rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    this.rl.on('line', (line) => {
      this.handleStdoutLine(line);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (text) {
        this.logger.info(`[worker-stderr] ${text}`);
      }
    });

    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      const friendly =
        code === 'ENOENT'
          ? `Python executable '${this.pythonBin}' tidak ditemukan di PATH. Pasang Python 3.11+ atau atur PYTHON_BIN.`
          : `Python worker process error: ${err.message}`;
      this.logger.error(friendly, { error: err.message, code });
      this.rejectAllPending(
        new AppError(friendly, ErrorCode.WORKER_UNAVAILABLE, 503),
      );
      this.cleanup();
    });

    child.on('exit', (code, signal) => {
      const isWinStoreAlias = process.platform === 'win32' && (code === 9009 || code === 49);
      const friendly = isWinStoreAlias
        ? `Python belum terpasang (Windows Store stub exit code=${code}). Pasang Python 3.11+ agar fitur Vision/Kontroler aktif.`
        : `Python worker exited unexpectedly (code=${code}, signal=${signal})`;
      this.logger.warn(friendly, { code, signal });
      this.rejectAllPending(
        new AppError(friendly, ErrorCode.WORKER_UNAVAILABLE, 503),
      );
      this.cleanup();
    });
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: WorkerResponse;
    try {
      parsed = JSON.parse(trimmed) as WorkerResponse;
    } catch (err) {
      this.logger.error('Failed to parse Python worker stdout JSON', {
        line: trimmed,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const pending = this.pending.get(parsed.id);
    if (!pending) {
      this.logger.warn('Received response for unknown request ID', { id: parsed.id });
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(parsed.id);
    pending.resolve(parsed);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.process = null;
  }

  public async sendCommand<TPayload = Record<string, unknown>>(
    command: WorkerCommand,
    payload?: TPayload,
  ): Promise<WorkerResponse> {
    if (!this.isRunning()) {
      this.start();
    }

    if (!this.process || !this.process.stdin.writable) {
      throw new AppError(
        'Python worker stdin is not writable',
        ErrorCode.WORKER_UNAVAILABLE,
        503,
      );
    }

    const id = randomUUID();
    const request: WorkerRequest<TPayload> = {
      id,
      command,
      ...(payload !== undefined ? { payload } : {}),
      timestamp: new Date().toISOString(),
    };

    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new AppError(
            `Python worker command '${command}' timed out after ${this.timeoutMs}ms`,
            ErrorCode.WORKER_TIMEOUT,
            504,
          ),
        );
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const serialized = `${JSON.stringify(request)}\n`;
      this.process?.stdin.write(serialized, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(
            new AppError(
              `Failed to write to Python worker: ${err.message}`,
              ErrorCode.WORKER_UNAVAILABLE,
              503,
            ),
          );
        }
      });
    });
  }

  public async checkHealth(): Promise<ComponentStatus> {
    const checkedAt = new Date().toISOString();
    const started = Date.now();
    try {
      const res = await this.sendCommand('health_check');
      if (!res.ok) {
        return {
          name: 'Python Worker',
          status: 'degraded',
          latencyMs: Date.now() - started,
          message: res.error?.message ?? 'Worker returned error',
          checkedAt,
        };
      }

      const pyVersion = typeof res.data?.pythonVersion === 'string'
        ? res.data.pythonVersion
        : 'unknown';

      return {
        name: 'Python Worker',
        status: 'healthy',
        latencyMs: Date.now() - started,
        message: `Python ${pyVersion}`,
        checkedAt,
      };
    } catch (err) {
      return {
        name: 'Python Worker',
        status: 'offline',
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : 'Worker unreachable',
        checkedAt,
      };
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning()) {
      this.cleanup();
      return;
    }

    try {
      await this.sendCommand('shutdown');
    } catch {
      // Force kill if graceful shutdown fails
      this.process?.kill('SIGTERM');
    } finally {
      this.cleanup();
    }
  }
}
