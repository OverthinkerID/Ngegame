import fs from 'node:fs';
import path from 'node:path';
import type { LogLevel } from '../config/env.js';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_PATTERN = /(key|secret|password|token|authorization|credential|streamkey)/i;
const MAX_LOG_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB per file
const MAX_LOG_ROTATIONS = 3;

export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (/^(sk-|ghp_|github_pat_|live_)[A-Za-z0-9_-]{8,}/.test(value.trim())) {
      return '[REDACTED_SECRET]';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitiveData(v, depth + 1);
      }
    }
    return out;
  }

  return value;
}

function rotateLogIfNeeded(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_LOG_SIZE_BYTES) return;

    for (let i = MAX_LOG_ROTATIONS - 1; i >= 1; i -= 1) {
      const older = `${filePath}.${i}`;
      const newer = `${filePath}.${i + 1}`;
      if (fs.existsSync(older)) {
        fs.renameSync(older, newer);
      }
    }
    fs.renameSync(filePath, `${filePath}.1`);
  } catch {
    // Hindari kegagalan logging mengganggu proses utama
  }
}

export class Logger {
  private readonly source: string;
  private readonly minLevel: LogLevel;
  private readonly logFilePath: string | null;

  constructor(source: string, minLevel: LogLevel = 'info') {
    this.source = source;
    this.minLevel = minLevel;

    const logDir = process.env.NGEGAME_LOG_DIR;
    if (logDir && process.env.NODE_ENV !== 'test') {
      try {
        fs.mkdirSync(logDir, { recursive: true });
        this.logFilePath = path.join(logDir, 'ngegame-backend.log');
      } catch {
        this.logFilePath = null;
      }
    } else {
      this.logFilePath = null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel];
  }

  private format(level: LogLevel, message: string, meta?: unknown): string {
    const timestamp = new Date().toISOString();
    const safeMeta = meta !== undefined ? redactSensitiveData(meta) : undefined;
    const metaSuffix = safeMeta !== undefined ? ` ${JSON.stringify(safeMeta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] [${this.source}] ${message}${metaSuffix}`;
  }

  private writeToFile(line: string): void {
    if (!this.logFilePath) return;
    try {
      rotateLogIfNeeded(this.logFilePath);
      fs.appendFileSync(this.logFilePath, `${line}\n`, 'utf8');
    } catch {
      // Abaikan error IO log
    }
  }

  debug(message: string, meta?: unknown): void {
    if (this.shouldLog('debug')) {
      const line = this.format('debug', message, meta);
      console.debug(line);
      this.writeToFile(line);
    }
  }

  info(message: string, meta?: unknown): void {
    if (this.shouldLog('info')) {
      const line = this.format('info', message, meta);
      console.info(line);
      this.writeToFile(line);
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.shouldLog('warn')) {
      const line = this.format('warn', message, meta);
      console.warn(line);
      this.writeToFile(line);
    }
  }

  error(message: string, meta?: unknown): void {
    if (this.shouldLog('error')) {
      const line = this.format('error', message, meta);
      console.error(line);
      this.writeToFile(line);
    }
  }
}
