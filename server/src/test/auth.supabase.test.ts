import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env.js';
import { errorHandler, notFound } from '../middleware/error.js';

interface LocalAuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarAssetId?: string | null;
}

interface MockSignUpResult {
  data: {
    user: SupabaseUser;
    session: {
      access_token: string;
    };
  };
  error: null;
}

const { getSupabaseUserMock, syncSupabaseUserMock, prismaUserFindUniqueMock, supabaseSignUpMock } = vi.hoisted(() => ({
  getSupabaseUserMock: vi.fn<(accessToken: string) => Promise<SupabaseUser>>(),
  syncSupabaseUserMock: vi.fn<(user: SupabaseUser) => Promise<LocalAuthUser>>(),
  prismaUserFindUniqueMock: vi.fn<
    (args: { where: { id: string } }) => Promise<LocalAuthUser | null>
  >(),
  supabaseSignUpMock: vi.fn<(args: { email: string; password: string }) => Promise<MockSignUpResult>>(),
}));

vi.mock('../lib/supabase.js', () => ({
  isSupabaseEnabled: () => true,
  getSupabasePublicConfig: () => ({
    enabled: true,
    url: 'https://example.supabase.co',
    anonKey: 'test-anon-key',
  }),
  getSupabaseUser: getSupabaseUserMock,
}));

vi.mock('../modules/auth/auth.service.js', () => ({
  registerUser: vi.fn(),
  authenticate: vi.fn(),
  changePassword: vi.fn(),
  deleteUser: vi.fn(),
  syncSupabaseUser: syncSupabaseUserMock,
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    user: {
      findUnique: prismaUserFindUniqueMock,
    },
  },
}));

let appPromise: Promise<Express> | null = null;

async function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = import('../modules/auth/auth.routes.js').then(({ default: authRoutes }) => {
      const app = express();
      app.use(express.json());
      app.use(session({
        name: env.SESSION_COOKIE_NAME,
        secret: env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          maxAge: env.SESSION_MAX_AGE_MS,
        },
      }));
      app.use('/api/auth', authRoutes);
      app.use(notFound);
      app.use(errorHandler);
      return app;
    });
  }
  return await appPromise;
}

function makeSupabaseUser(overrides: Partial<SupabaseUser> = {}): SupabaseUser {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'sb-user-123456',
    aud: 'authenticated',
    role: 'authenticated',
    email: overrides.email ?? 'supabase_user@test.local',
    email_confirmed_at: overrides.email_confirmed_at ?? now,
    phone: overrides.phone ?? '',
    confirmed_at: overrides.confirmed_at ?? now,
    last_sign_in_at: overrides.last_sign_in_at ?? now,
    app_metadata: overrides.app_metadata ?? { provider: 'email', providers: ['email'] },
    user_metadata: overrides.user_metadata ?? { username: 'supabase_user', display_name: 'Supabase User' },
    identities: overrides.identities ?? [],
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    is_anonymous: overrides.is_anonymous ?? false,
    factors: overrides.factors ?? [],
  } as SupabaseUser;
}

function makeLocalUser(overrides: Partial<LocalAuthUser> = {}): LocalAuthUser {
  return {
    id: overrides.id ?? 'local-user-123456',
    email: overrides.email ?? 'supabase_user@test.local',
    username: overrides.username ?? 'supabase_user',
    displayName: overrides.displayName ?? 'Supabase User',
    avatarAssetId: overrides.avatarAssetId ?? null,
  };
}

describe('auth supabase session exchange', () => {
  beforeEach(() => {
    getSupabaseUserMock.mockReset();
    syncSupabaseUserMock.mockReset();
    prismaUserFindUniqueMock.mockReset();
    supabaseSignUpMock.mockReset();
  });

  it('follows the mocked sign-up -> session creation -> /api/auth/me sequence', async () => {
    const sequence: string[] = [];
    const supabaseUser = makeSupabaseUser();
    const localUser = makeLocalUser({ email: supabaseUser.email ?? 'supabase_user@test.local' });

    supabaseSignUpMock.mockImplementation(async ({ email }) => {
      sequence.push('sign-up');
      return {
        data: {
          user: makeSupabaseUser({ email }),
          session: { access_token: 'supabase-token-1' },
        },
        error: null,
      };
    });
    getSupabaseUserMock.mockImplementation(async (accessToken) => {
      sequence.push('session-creation');
      expect(accessToken).toBe('supabase-token-1');
      return supabaseUser;
    });
    syncSupabaseUserMock.mockResolvedValue(localUser);
    prismaUserFindUniqueMock.mockImplementation(async ({ where }) => {
      sequence.push('me');
      expect(where.id).toBe(localUser.id);
      return localUser;
    });

    const signUp = await supabaseSignUpMock({
      email: supabaseUser.email ?? 'supabase_user@test.local',
      password: 'SupabaseTest123!',
    });

    expect(signUp.error).toBeNull();
    expect(signUp.data.user.email).toBe(supabaseUser.email);
    expect(signUp.data.session.access_token).toBe('supabase-token-1');

    const agent = request.agent(await getApp());
    const exchange = await agent
      .post('/api/auth/supabase/session')
      .send({ accessToken: signUp.data.session.access_token })
      .expect(200);

    expect(getSupabaseUserMock).toHaveBeenCalledWith('supabase-token-1');
    expect(syncSupabaseUserMock).toHaveBeenCalledWith(supabaseUser);
    expect(exchange.body.user).toEqual({
      id: localUser.id,
      email: localUser.email,
      username: localUser.username,
      displayName: localUser.displayName,
      avatarAssetId: localUser.avatarAssetId,
    });

    const raw = exchange.headers['set-cookie'] ?? [];
    const setCookie = (Array.isArray(raw) ? raw : [raw]).join(';');
    expect(/Max-Age=|Expires=/i.test(setCookie)).toBe(true);

    const me1 = await agent.get('/api/auth/me').expect(200);
    const me2 = await agent.get('/api/auth/me').expect(200);

    expect(me1.body.user).toEqual(localUser);
    expect(me2.body.user).toEqual(localUser);
    expect(sequence).toEqual(['sign-up', 'session-creation', 'me', 'me']);
  });

  it('uses a browser-session cookie when rememberMe=false and still returns /api/auth/me', async () => {
    const supabaseUser = makeSupabaseUser({
      id: 'sb-user-remember-false',
      email: 'supabase_remember_false@test.local',
      user_metadata: { username: 'remember_false_user' },
    });
    const localUser = makeLocalUser({
      id: 'local-user-remember-false',
      email: 'supabase_remember_false@test.local',
      username: 'remember_false_user',
      displayName: 'remember_false_user',
    });

    supabaseSignUpMock.mockResolvedValue({
      data: {
        user: supabaseUser,
        session: { access_token: 'supabase-token-2' },
      },
      error: null,
    });
    getSupabaseUserMock.mockResolvedValue(supabaseUser);
    syncSupabaseUserMock.mockResolvedValue(localUser);
    prismaUserFindUniqueMock.mockResolvedValue(localUser);

    const signUp = await supabaseSignUpMock({
      email: supabaseUser.email ?? 'supabase_remember_false@test.local',
      password: 'SupabaseTest123!',
    });

    const agent = request.agent(await getApp());
    const exchange = await agent
      .post('/api/auth/supabase/session')
      .send({ accessToken: signUp.data.session.access_token, rememberMe: false })
      .expect(200);

    const raw = exchange.headers['set-cookie'] ?? [];
    const setCookie = (Array.isArray(raw) ? raw : [raw]).join(';');
    expect(/Max-Age=/i.test(setCookie)).toBe(false);
    expect(/Expires=/i.test(setCookie)).toBe(false);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user).toEqual(localUser);
  });
});
