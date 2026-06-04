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

export function getSupabasePublicConfig() {
  return {
    enabled: isSupabaseEnabled(),
    url: env.SUPABASE_URL?.trim() ?? null,
    anonKey: env.SUPABASE_ANON_KEY?.trim() ?? null,
  };
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
