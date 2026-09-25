// ============================================================
// Focussive Backend — Global Error Handler
// ============================================================

import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err.message);

  if (err instanceof AppError || (err && typeof (err as any).statusCode === 'number')) {
    const statusCode = (err as any).statusCode || 500;
    res.status(statusCode).json({
      error: err.message,
      code: (err as any).code || 'ERROR',
    });
    return;
  }

  // Default to 500
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
