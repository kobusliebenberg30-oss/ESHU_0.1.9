import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'NotFound' });
};

// Errors raised by body-parser (e.g. malformed JSON) and other framework
// middleware follow the http-errors convention: a numeric `statusCode` plus
// `expose: true` to indicate the message is safe to surface to clients.
const isExposedHttpError = (
  err: unknown,
): err is { statusCode: number; expose: true; message: string; type?: string } =>
  typeof err === 'object' &&
  err !== null &&
  (err as { expose?: unknown }).expose === true &&
  typeof (err as { statusCode?: unknown }).statusCode === 'number' &&
  (err as { statusCode: number }).statusCode >= 400 &&
  (err as { statusCode: number }).statusCode < 500;

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'ValidationError', issues: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (isExposedHttpError(err)) {
    // e.g. body-parser SyntaxError -> 400 BadRequest, payload-too-large -> 413, etc.
    res.status(err.statusCode).json({ error: err.type ?? 'BadRequest', message: err.message });
    return;
  }
  logger.error({ err, path: req.path }, 'unhandled error');
  // Also write a clear, single-line stack to stderr so it shows up in the
  // server terminal even when pino's transport is filtering noisy fields.
  // Helps diagnose 500s when the user can only see DevTools.
  try {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error('[errorHandler] 500 on ' + req.method + ' ' + req.path + ':\n' + stack);
  } catch {
    // ignore stderr logging failures
  }
  const isDev = process.env.NODE_ENV !== 'production';
  const body: Record<string, unknown> = { error: 'InternalServerError' };
  if (isDev && err instanceof Error) {
    body.message = err.message;
    body.name = err.name;
    // Prisma errors carry useful diagnostic codes.
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') body.code = code;
    const meta = (err as { meta?: unknown }).meta;
    if (meta && typeof meta === 'object') body.meta = meta;
  }
  res.status(500).json(body);
};
