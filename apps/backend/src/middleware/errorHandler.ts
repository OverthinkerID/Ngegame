import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '@ngegame/shared';
import { Logger } from '../utils/logger.js';

const logger = new Logger('error-handler');

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    new AppError(
      `Route not found: ${req.method} ${req.originalUrl}`,
      ErrorCode.NOT_FOUND,
      404,
    ),
  );
}

export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.warn('Operational AppError', err.toJSON());
    res.status(err.statusCode).json({
      ok: false,
      error: err.toJSON(),
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error('Unhandled server error', {
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    ok: false,
    error: {
      name: 'InternalError',
      code: ErrorCode.UNKNOWN_ERROR,
      statusCode: 500,
      message,
    },
  });
}
