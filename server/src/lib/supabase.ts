import { Agent, request } from 'node:https';
import { getCACertificates } from 'node:tls';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { env } from '../env.js';
import { HttpError } from '../middleware/error.js';

// Use system CAs if available (corporate proxies, custom roots).
// Falls back to undefined → Node's bundled root CAs, which is what Vercel needs.
const systemCAs = (() => {
  try {
    const cas = getCACertificates('system');
    return Array.isArray(cas) && cas.length > 0 ? cas : undefined;
  } catch {
    return undefined;
  }
})();
const supabaseAgent = systemCAs ? new Agent({ ca: systemCAs }) : undefined;

function isSupabaseUser(value: unknown): value is SupabaseUser {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

async function fetchSupabaseUser(accessToken: string): Promise<unknown> {
  const url = new URL('/auth/v1/user', env.SUPABASE_URL?.trim());

  return await new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET',
      agent: supabaseAgent,
      headers: {
        apikey: env.SUPABASE_ANON_KEY?.trim(),
        authorization: `Bearer ${accessToken}`,
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const payload = body ? JSON.parse(body) as unknown : null;
        if ((res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300) {
          resolve(payload);
          return;
        }
        reject(new HttpError(401, 'Invalid Supabase session', payload));
      });
    });

    req.on('error', (error) => {
      reject(new HttpError(502, 'Supabase verification failed', error instanceof Error ? error.message : String(error)));
    });

    req.end();
  });
}

export function isSupabaseEnabled(): boolean {
  return !!(env.SUPABASE_URL?.trim() && env.SUPABASE_ANON_KEY?.trim());
}

// Canonical Supabase env var names the app reads. Anything in process.env that
// looks like a near-miss of one of these (e.g. `SUPARASF_URL`, `SUPABSE_URL`,
// `SUPABASE_ANON`) is almost certainly a typo that silently disables auth /
// realtime, so we surface it loudly at startup.
const CANONICAL_SUPABASE_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

export interface SupabaseEnvDiagnosis {
  enabled: boolean;
  /** Required-for-auth vars that are missing or blank. */
  missingRequired: string[];
  /** Recommended-but-optional vars that are missing or blank. */
  missingRecommended: string[];
  /** process.env keys that look like typos of a canonical Supabase var. */
  suspiciousKeys: string[];
}

/**
 * Inspect the process environment for Supabase misconfiguration WITHOUT ever
 * logging secret values. Used by the startup guard and the health endpoint so
 * a silent misconfig (the classic cause of "I'm signed in but nothing saves")
 * is impossible to miss.
 */
export function diagnoseSupabaseEnv(): SupabaseEnvDiagnosis {
  const blank = (v: string | undefined) => !v || !v.trim();

  const missingRequired: string[] = [];
  if (blank(env.SUPABASE_URL)) missingRequired.push('SUPABASE_URL');
  if (blank(env.SUPABASE_ANON_KEY)) missingRequired.push('SUPABASE_ANON_KEY');

  const missingRecommended: string[] = [];
  if (blank(env.SUPABASE_SERVICE_ROLE_KEY)) missingRecommended.push('SUPABASE_SERVICE_ROLE_KEY');

  // Flag env keys that mention "SUPA"/"SUPB" + a known suffix but don't exactly
  // match a canonical name — i.e. a likely misspelling.
  const canonical = new Set<string>(CANONICAL_SUPABASE_KEYS);
  const suspiciousKeys = Object.keys(process.env).filter((k) => {
    if (canonical.has(k)) return false;
    const looksSupabase = /^SUP[A-Z]*B?[A-Z]*S/i.test(k) || /SUPA/i.test(k);
    const hasSuffix = /(URL|ANON|SERVICE|ROLE|KEY)/i.test(k);
    return looksSupabase && hasSuffix;
  });

  return {
    enabled: isSupabaseEnabled(),
    missingRequired,
    missingRecommended,
    suspiciousKeys,
  };
}

export function getSupabasePublicConfig() {
  return {
    enabled: isSupabaseEnabled(),
    url: env.SUPABASE_URL?.trim() ?? null,
    anonKey: env.SUPABASE_ANON_KEY?.trim() ?? null,
  };
}

// Realtime Broadcast channel + event the browser (realtime-sync.js) listens
// on. Kept in one place so client and server can't drift.
export const REALTIME_CHANGE_TOPIC = 'eshu-db-changes';
export const REALTIME_CHANGE_EVENT = 'changed';

/**
 * Notify every connected client that server data changed, WITHOUT shipping any
 * row data. Uses Supabase Realtime's HTTP Broadcast endpoint (one stateless
 * POST — serverless-friendly, no websocket from the function) on a PUBLIC
 * channel, so it needs no RLS and never exposes row contents cross-user. The
 * client treats the message purely as a "re-pull /api/sync" trigger.
 *
 * Best-effort and fire-and-forget: any failure (Supabase off, network blip,
 * non-2xx) is swallowed and logged at debug level. Liveness degrades to the
 * polling fallback; a dropped notification never breaks a write.
 *
 * @param tables optional hint of which Prisma tables changed (informational).
 */
export function broadcastChange(tables?: string[]): void {
  const baseUrl = env.SUPABASE_URL?.trim();
  // Prefer the service-role key (bypasses any Realtime authorization); fall
  // back to the anon key, which is sufficient for a public-channel broadcast.
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_ANON_KEY?.trim();
  if (!baseUrl || !key) return; // Supabase not configured: no-op.

  let url: URL;
  try {
    url = new URL('/realtime/v1/api/broadcast', baseUrl);
  } catch {
    return;
  }

  const body = JSON.stringify({
    messages: [
      {
        topic: REALTIME_CHANGE_TOPIC,
        event: REALTIME_CHANGE_EVENT,
        payload: {
          tables: Array.isArray(tables) ? tables : undefined,
          at: Date.now(),
        },
        private: false,
      },
    ],
  });

  try {
    const req = request(
      url,
      {
        method: 'POST',
        agent: supabaseAgent,
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        // Drain so the socket can be reused/closed; ignore the body.
        res.on('data', () => {});
        res.on('end', () => {});
      },
    );
    req.on('error', () => {});
    req.end(body);
  } catch {
    // Never let a notification failure surface to the caller.
  }
}

export async function getSupabaseUser(accessToken: string): Promise<SupabaseUser> {
  if (!isSupabaseEnabled()) throw new HttpError(503, 'Supabase auth is not configured');
  if (!accessToken) throw new HttpError(400, 'Supabase access token is required');

  const user = await fetchSupabaseUser(accessToken);
  if (!isSupabaseUser(user)) {
    throw new HttpError(401, 'Invalid Supabase session');
  }
  if (!user.email) {
    throw new HttpError(400, 'Supabase account is missing an email address');
  }
  if (!user.email_confirmed_at) {
    throw new HttpError(403, 'Please confirm your email before signing in');
  }
  return user;
}
