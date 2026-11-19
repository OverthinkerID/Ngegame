export type ComponentState = 'healthy' | 'degraded' | 'offline';

export interface ComponentStatus {
  name: string;
  status: ComponentState;
  latencyMs?: number;
  message?: string;
  checkedAt: string;
}

export interface SystemHealthResponse {
  status: ComponentState;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  components: {
    backend: ComponentStatus;
    database: ComponentStatus;
    pythonWorker: ComponentStatus;
  };
}

export interface SystemLogEntry {
  id: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: string | null;
  createdAt: string;
}
