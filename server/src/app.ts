import express, { type Express } from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pinoHttp } from 'pino-http';
import rateLimit from 'express-rate-limit';

import { env } from './env.js';
import { logger } from './lib/logger.js';
import { getSupabasePublicConfig, broadcastChange } from './lib/supabase.js';
import { errorHandler, notFound } from './middleware/error.js';
import { prisma } from './db/client.js';

import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import assetRoutes from './modules/assets/assets.routes.js';
import profileRoutes from './modules/profiles/profiles.routes.js';
import groupRoutes from './modules/groups/groups.routes.js';
import gameRoutes from './modules/games/games.routes.js';
import creationRoutes from './modules/creations/creations.routes.js';
import commentRoutes from './modules/comments/comments.routes.js';
import settingRoutes from './modules/settings/settings.routes.js';
import syncRoutes from './modules/sync/sync.routes.js';
import xpRoutes from './modules/xp/xp.routes.js';

const WEB_ROOT = resolve(import.meta.dirname, '../../pages');
const DEFAULT_ENTRY = resolve(WEB_ROOT, 'eshu.html');
const SUPABASE_UMD_CANDIDATES = [
  resolve(import.meta.dirname, '../../node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
  resolve(import.meta.dirname, '../node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
  resolve(import.meta.dirname, '../../../node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
  resolve(process.cwd(), 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
  resolve(process.cwd(), 'server/node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
];
const SUPABASE_UMD: string =
  SUPABASE_UMD_CANDIDATES.find((c) => existsSync(c)) ?? SUPABASE_UMD_CANDIDATES[0]!;
const require = createRequire(import.meta.url);
const { Pool: PgPool } = require('pg') as {
  Pool: new (options: {
    connectionString: string;
    max?: number;
    ssl?: { rejectUnauthorized: boolean };
  }) => unknown;
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function sessionConnectionString(): string {
  if (env.NODE_ENV !== 'production') return env.DATABASE_URL;
  try {
    const url = new URL(env.DATABASE_URL);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return env.DATABASE_URL;
  }
}

function vercelPreviewOrigins(): string[] {
  const out: string[] = [];
  const url = process.env.VERCEL_URL;
  if (url) {
    out.push(`https://${url}`);
  }
  const branch = process.env.VERCEL_BRANCH_URL;
  if (branch) {
    out.push(`https://${branch}`);
  }
  return out;
}

function isSameVercelProjectDeployment(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.vercel.app')) {
      return false;
    }

    const currentDeployment = process.env.VERCEL_URL;
    if (!currentDeployment) return false;
    const currentHost = currentDeployment.replace(/^https?:\/\//, '').split('/')[0] ?? '';
    if (!currentHost.endsWith('.vercel.app')) return false;

    for (const allowed of env.CORS_ORIGIN) {
      const allowedHost = new URL(allowed).hostname;
      if (!allowedHost.endsWith('.vercel.app')) continue;

      const projectSlug = allowedHost.replace(/\.vercel\.app$/, '');
      const deploymentSlug = currentHost.replace(/\.vercel\.app$/, '');
      if (!deploymentSlug.startsWith(`${projectSlug}-`)) continue;

      const suffix = deploymentSlug.slice(projectSlug.length + 1);
      const firstDash = suffix.indexOf('-');
      if (firstDash < 0) continue;

      const teamSlug = suffix.slice(firstDash + 1);
      const expectedPrefix = `${projectSlug}-`;
      const expectedSuffix = `-${teamSlug}.vercel.app`;
      if (parsed.hostname.startsWith(expectedPrefix) && parsed.hostname.endsWith(expectedSuffix)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (env.CORS_ORIGIN.includes(origin)) return true;
  if (vercelPreviewOrigins().includes(origin)) return true;
  if (isSameVercelProjectDeployment(origin)) return true;
  if (env.NODE_ENV === 'production') return false;
  try {
    const parsed = new URL(origin);
    return LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export const buildApp = (): Express => {
  const app = express();
  const PgStore = connectPgSimple(session);
  const sessionPoolOptions = {
    // Strip sslmode=require for this direct pg consumer; pg-connection-string
    // otherwise re-enables certificate verification and overrides the ssl
    // object below.
    connectionString: sessionConnectionString(),
    max: 1,
    ...(env.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: false } } : {}),
  };
  const sessionPool = new PgPool(sessionPoolOptions);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(pinoHttp({
    logger,
    // Suppress noisy per-request header dumps in dev; log only method+url+status+time
    serializers: {
      req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    // Don't log successful health-check / auth-me polling
    autoLogging: {
      ignore: (req: { url?: string }) => req.url === '/healthz',
    },
  }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        },
      },
    }),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isAllowedCorsOrigin(origin)) {
      next();
      return;
    }
    res.status(403).json({ error: 'CORS_ORIGIN_BLOCKED', message: 'Origin not allowed.' });
  });
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    const requestedHeaders = req.headers['access-control-request-headers'];
    if (requestedHeaders) {
      res.setHeader('Access-Control-Allow-Headers', String(requestedHeaders));
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  // JSON body limit is sized for the bulk /api/sync push, which today still
  // carries base64 image previews inside `data.image` for groups, games, and
  // (after Checkpoint A) creations. 1 MB silently 413'd a single full-res
  // image; 12 MB comfortably fits a snapshot with several. Once the asset
  // pipeline (POST /api/assets, multipart, bound by STORAGE_MAX_BYTES) owns
  // every image upload path this can be tightened back down.
  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      name: env.SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: env.SESSION_COOKIE_SAME_SITE,
        secure: env.NODE_ENV === 'production' || env.SESSION_COOKIE_SAME_SITE === 'none',
        maxAge: env.SESSION_MAX_AGE_MS,
      },
      store: new PgStore({
        pool: sessionPool,
        tableName: 'Session',
        createTableIfMissing: false,
      }),
    }),
  );

  // Exposes NODE_ENV so external smoke scripts can refuse to run against a
  // dev/prod server. Intentionally does NOT leak DATABASE_URL, secrets, etc.
  // Mounted before the rate limiter so smoke preflights never get throttled.
  app.get('/healthz', (_req, res) =>
    res.json({ ok: true, env: process.env.NODE_ENV ?? 'development' }),
  );

  // Keep-warm endpoint for an external uptime pinger (e.g. UptimeRobot /
  // cron-job.org hitting this every ~5 min). Unlike /healthz it touches the
  // database with a trivial query, so it keeps BOTH the serverless lambda and
  // a pooled DB connection hot — that's what makes the *first* signed-in pull
  // after an idle period fast instead of paying a full cold start. Mounted
  // before the rate limiter and before session, so pings never burn the
  // /api budget or create session rows. Always returns 200 quickly; a DB
  // hiccup degrades to { db: false } rather than erroring the pinger.
  app.get('/api/warm', async (_req, res) => {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    res.json({ ok: true, db, ts: Date.now() });
  });

  // Soft rate-limit, scoped to the API surface only. Previously this was a
  // global `app.use(rateLimit(...))`, which counted every static asset GET
  // (HTML, CSS, JS, image) toward the same 300/min budget — a single hard
  // refresh of a page like games.html could push the limiter over and the
  // browser would render the bare "Too many requests" plain-text response
  // because even the HTML payload was being throttled. Static files no
  // longer count; only `/api/*` calls do, and the response is JSON so the
  // client can show a friendly toast instead of a wall of plain text.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: 'RATE_LIMIT',
          message: 'Too many requests — slow down tiger! Please try again in a moment.',
        });
      },
    }),
  );

  // Live-sync notifier: after any SUCCESSFUL mutating /api request, fire a
  // single payload-free Supabase Broadcast so other devices/tabs re-pull
  // /api/sync immediately (Layer 1 of pages/assets/core/realtime-sync.js).
  // Centralised here so every current and future write endpoint is covered
  // without per-route wiring. Runs on response 'finish' so it never delays
  // the response, and is gated to 2xx so failed writes don't trigger pulls.
  // Excludes /api/auth (session lifecycle, not shared data) and read methods.
  const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  app.use('/api', (req, res, next) => {
    if (MUTATING_METHODS.has(req.method) && !req.path.startsWith('/auth')) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          broadcastChange();
        }
      });
    }
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/profiles', profileRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/creations', creationRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/settings', settingRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/xp', xpRoutes);

  app.get('/assets/core/supabase-config.js', (_req, res) => {
    res.type('application/javascript');
    res.send(
      `window.ESHU_SUPABASE_CONFIG = ${JSON.stringify(getSupabasePublicConfig())};`,
    );
  });
  app.get('/vendor/supabase.js', (_req, res) => {
    res.sendFile(SUPABASE_UMD);
  });

  app.use(express.static(WEB_ROOT));
  app.get('/', (_req, res) => {
    res.sendFile(DEFAULT_ENTRY);
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
