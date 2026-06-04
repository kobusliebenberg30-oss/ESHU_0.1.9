import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Source = 'body' | 'query' | 'params';

export const validate =
  <S extends ZodTypeAny>(schema: S, source: Source = 'body'): RequestHandler =>
  (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(parsed.error);
    // Express 5 made `req.query` a getter-only property, so we can't simply
    // reassign it. To keep the public surface unchanged for downstream
    // handlers, mutate the existing object in place: clear all keys, then
    // copy the parsed/coerced values onto it. `body` and `params` remain
    // writable so we keep the simple assignment for them.
    if (source === 'query') {
      const target = req.query as Record<string, unknown>;
      for (const k of Object.keys(target)) delete target[k];
      Object.assign(target, parsed.data);
    } else {
      (req as unknown as Record<Source, unknown>)[source] = parsed.data;
    }
    next();
  };

export type Infer<S extends ZodTypeAny> = z.infer<S>;
