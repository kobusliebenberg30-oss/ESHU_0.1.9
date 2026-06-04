import type { RequestHandler } from 'express';
import { HttpError } from './error.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session?.userId) return next(new HttpError(401, 'Unauthorized'));
  next();
};
