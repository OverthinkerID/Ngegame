import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env if present (two levels up from apps/backend/src/config or three from dist)
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config();

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BackendEnvConfig {
  nodeEnv: string;
  logLevel: LogLevel;
  host: string;
  port: number;
  databaseUrl: string;
  pythonBin: string;
  pythonWorkerPath: string;
  pythonWorkerTimeoutMs: number;
}

export interface EnvValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const normalized = (raw ?? 'info').toLowerCase();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return 'info';
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

export function loadEnvConfig(): BackendEnvConfig {
  const defaultPythonBin = process.platform === 'win32' ? 'python' : 'python3';
  const defaultWorkerPath = path.resolve(
    process.cwd(),
    '..',
    'python-worker',
    'main.py',
  );

  // Ensure DATABASE_URL is set for Prisma when running without .env
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./dev.db';
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    host: process.env.BACKEND_HOST ?? '127.0.0.1',
    port: parsePort(process.env.BACKEND_PORT, 47800),
    databaseUrl: process.env.DATABASE_URL,
    pythonBin: process.env.PYTHON_BIN ?? defaultPythonBin,
    pythonWorkerPath: process.env.PYTHON_WORKER_PATH ?? defaultWorkerPath,
    pythonWorkerTimeoutMs: parsePort(process.env.PYTHON_WORKER_TIMEOUT_MS, 5000),
  };
}

export function validateEnvConfig(config: BackendEnvConfig): EnvValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!config.databaseUrl.startsWith('file:')) {
    errors.push('DATABASE_URL harus menggunakan skema SQLite file:...');
  }
  if (config.port < 1024 && process.platform !== 'win32') {
    warnings.push(`Port ${config.port} berada di rentang privileged (<1024).`);
  }
  if (!fs.existsSync(config.pythonWorkerPath)) {
    warnings.push(`Berkas Python Worker tidak ditemukan di: ${config.pythonWorkerPath}`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
