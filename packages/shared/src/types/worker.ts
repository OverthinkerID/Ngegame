export type WorkerCommand =
  | 'ping'
  | 'health_check'
  | 'echo'
  | 'shutdown'
  | 'vision_capabilities'
  | 'list_windows'
  | 'capture_frame'
  | 'controller_status'
  | 'controller_diagnostics'
  | 'controller_execute'
  | 'controller_pause'
  | 'controller_resume'
  | 'controller_release_all'
  | 'controller_emergency_stop'
  | 'controller_reset_emergency';

export interface WorkerRequest<TPayload = Record<string, unknown>> {
  id: string;
  command: WorkerCommand;
  payload?: TPayload;
  timestamp: string;
}

export interface WorkerErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface WorkerResponse<TData = Record<string, unknown>> {
  id: string;
  ok: boolean;
  data?: TData;
  error?: WorkerErrorPayload;
  timestamp: string;
}
