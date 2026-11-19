export enum ErrorCode {
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  WORKER_UNAVAILABLE = 'WORKER_UNAVAILABLE',
  WORKER_TIMEOUT = 'WORKER_TIMEOUT',
  WORKER_EXECUTION_ERROR = 'WORKER_EXECUTION_ERROR',
  IPC_ERROR = 'IPC_ERROR',
  NOT_FOUND = 'NOT_FOUND',
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    statusCode = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): {
    name: string;
    message: string;
    code: ErrorCode;
    statusCode: number;
    details?: unknown;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}
