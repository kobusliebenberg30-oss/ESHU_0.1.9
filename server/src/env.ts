import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // PORT=0 is meaningful: bind to an OS-assigned ephemeral port (used by tests).
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Pooled URL for runtime (Supabase pooler :6543 with ?pgbouncer=true, or local).
  DATABASE_URL: z.string().min(1),
  // Direct Postgres URL for Prisma migrations (Supabase :5432 session/direct).
  DIRECT_URL: z.string().min(1).optional(),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  SESSION_COOKIE_NAME: z.string().default('eshu.sid'),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(30 * 24 * 60 * 60 * 1000),
  // 'lax' (default) works for same-origin Vercel deploys.
  // Set to 'none' when running split-origin dev (pages on :8080, API on :3000);
  // 'none' requires secure:true so the browser must be on HTTPS or localhost.
  SESSION_COOKIE_SAME_SITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  SUPABASE_URL: z.string().trim().url().optional(),
  SUPABASE_ANON_KEY: z.string().trim().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1).optional(),

  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  STORAGE_DRIVER: z.enum(['local', 's3', 'supabase']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage/assets'),
  STORAGE_SUPABASE_BUCKET: z.string().trim().min(1).default('eshu-assets'),
  STORAGE_MAX_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
}).superRefine((value, ctx) => {
  if (value.SUPABASE_ANON_KEY && !value.SUPABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SUPABASE_URL'],
      message: 'SUPABASE_URL is required when SUPABASE_ANON_KEY is set',
    });
  }

  if (value.STORAGE_DRIVER === 'supabase') {
    if (!value.SUPABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_URL'],
        message: 'SUPABASE_URL is required when STORAGE_DRIVER=supabase',
      });
    }
    if (!value.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
        message: 'SUPABASE_SERVICE_ROLE_KEY is required when STORAGE_DRIVER=supabase',
      });
    }
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\nInvalid environment configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.SUPABASE_ANON_KEY && !parsed.data.SUPABASE_URL) {
  console.error('\nInvalid environment configuration:\n', {
    SUPABASE_URL: ['SUPABASE_URL is required when SUPABASE_ANON_KEY is set'],
  });
  process.exit(1);
}

// Fail fast on Vercel with local disk storage. Vercel functions run on an
// EPHEMERAL filesystem that is wiped between cold starts and is NOT shared
// across instances/regions, so uploaded asset bytes written by the `local`
// driver silently disappear — images upload "successfully" but 404 on any
// other device. This refuses to boot so the misconfiguration is caught at
// deploy time instead of as missing avatars/creations in production.
// (Self-hosted production with a persistent disk is unaffected: this only
// triggers when the VERCEL env var is present.)
if (process.env.VERCEL && parsed.data.STORAGE_DRIVER === 'local') {
  console.error(
    '\nInvalid storage configuration for Vercel:\n' +
      '  STORAGE_DRIVER=local is unsafe on Vercel — the serverless filesystem is\n' +
      '  ephemeral, so uploaded images are lost across cold starts and instances.\n' +
      '  Set STORAGE_DRIVER=supabase (plus SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,\n' +
      '  STORAGE_SUPABASE_BUCKET) in your Vercel Environment Variables.\n',
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
