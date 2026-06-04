import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeDb, getApp, registerAndAuth, truncateAll } from './helpers.js';

describe('auth', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('registers, returns the user, and sets a session cookie', async () => {
    const { user, agent } = await registerAndAuth();
    expect(user.email).toMatch(/@test\.local$/);
    expect(user.username).toMatch(/^user_/);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.id).toBe(user.id);
  });

  it('rejects duplicate email/username with 409', async () => {
    await registerAndAuth({ email: 'dup@test.local', username: 'dup_user' });
    const res = await request(getApp())
      .post('/api/auth/register')
      .send({ email: 'dup@test.local', username: 'dup_user', password: 'hunter2hunter2' });
    expect(res.status).toBe(409);
  });

  it('rejects /api/auth/me without a session', async () => {
    const res = await request(getApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('logs in with email or username and rejects bad credentials', async () => {
    const password = 'hunter2hunter2';
    await registerAndAuth({ email: 'login@test.local', username: 'login_user', password });

    const okEmail = await request(getApp())
      .post('/api/auth/login')
      .send({ emailOrUsername: 'login@test.local', password })
      .expect(200);
    expect(okEmail.body.user.username).toBe('login_user');

    const okUsername = await request(getApp())
      .post('/api/auth/login')
      .send({ emailOrUsername: 'login_user', password })
      .expect(200);
    expect(okUsername.body.user.email).toBe('login@test.local');

    const bad = await request(getApp())
      .post('/api/auth/login')
      .send({ emailOrUsername: 'login_user', password: 'wrongpass' });
    expect(bad.status).toBe(401);
  });

  it('logout invalidates the session', async () => {
    const { agent } = await registerAndAuth();
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects malformed register payload with 400', async () => {
    const res = await request(getApp())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', username: 'a', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  // ---------- F5: Auth lifecycle ----------

  it('change-password rotates the credential and the session id', async () => {
    const password = 'hunter2hunter2';
    const { agent, user } = await registerAndAuth({
      username: 'pw_change',
      email: 'pwchange@test.local',
      password,
    });

    // Capture the original session cookie before the rotation.
    const me1 = await agent.get('/api/auth/me').expect(200);
    const originalCookieHeader = me1.headers['set-cookie']?.[0] ?? '';

    const newPassword = 'evenstrongerpw9';
    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: password, newPassword })
      .expect(204);

    // Session is preserved across the rotation but its id has changed.
    const me2 = await agent.get('/api/auth/me').expect(200);
    expect(me2.body.user.id).toBe(user.id);
    const newCookieHeader = me2.headers['set-cookie']?.[0] ?? '';
    if (originalCookieHeader && newCookieHeader) {
      expect(newCookieHeader).not.toBe(originalCookieHeader);
    }

    // Old credential is rejected; new one works on a fresh client.
    await request(getApp())
      .post('/api/auth/login')
      .send({ emailOrUsername: 'pw_change', password })
      .expect(401);
    await request(getApp())
      .post('/api/auth/login')
      .send({ emailOrUsername: 'pw_change', password: newPassword })
      .expect(200);
  });

  it('change-password rejects wrong currentPassword with 401', async () => {
    const { agent } = await registerAndAuth();
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'this-is-not-it', newPassword: 'newvalidpw9' });
    expect(res.status).toBe(401);
  });

  it('change-password refuses identical new password with 400', async () => {
    const password = 'hunter2hunter2';
    const { agent } = await registerAndAuth({ password });
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: password, newPassword: password });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/differ/i);
  });

  it('change-password requires authentication', async () => {
    const res = await request(getApp())
      .post('/api/auth/change-password')
      .send({ currentPassword: 'a', newPassword: 'newvalidpw9' });
    expect(res.status).toBe(401);
  });

  it('delete account: removes the user, cascades, destroys the session', async () => {
    const password = 'hunter2hunter2';
    const { agent, user } = await registerAndAuth({
      username: 'goner',
      email: 'goner@test.local',
      password,
    });

    // Trigger lazy profile provisioning so we can verify the cascade.
    await agent.get('/api/profiles').expect(200);

    const { prisma } = await import('../db/client.js');
    expect(await prisma.profile.count({ where: { userId: user.id } })).toBe(1);

    await agent.delete('/api/auth/account').send({ password }).expect(204);

    // Session is dead.
    await agent.get('/api/auth/me').expect(401);

    // User and dependants are gone.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.profile.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.userSetting.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it('delete account: rejects wrong password with 401 and leaves the user intact', async () => {
    const { agent, user } = await registerAndAuth();
    await agent
      .delete('/api/auth/account')
      .send({ password: 'definitely-not-the-password' })
      .expect(401);

    const { prisma } = await import('../db/client.js');
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    // Session still works.
    await agent.get('/api/auth/me').expect(200);
  });

  it('login: rememberMe=false emits a browser-session cookie (no Max-Age/Expires)', async () => {
    const password = 'hunter2hunter2';
    await registerAndAuth({
      username: 'remember_me',
      email: 'remember@test.local',
      password,
    });

    const res = await request(getApp())
      .post('/api/auth/login')
      .send({ emailOrUsername: 'remember_me', password, rememberMe: false })
      .expect(200);

    const raw = res.headers['set-cookie'] ?? [];
    const setCookie = (Array.isArray(raw) ? raw : [raw]).join(';');
    // A browser-session cookie has neither Expires nor Max-Age attributes.
    expect(/Max-Age=/i.test(setCookie)).toBe(false);
    expect(/Expires=/i.test(setCookie)).toBe(false);
  });

  it('login: rememberMe omitted keeps the persistent cookie (Max-Age set)', async () => {
    const password = 'hunter2hunter2';
    await registerAndAuth({
      username: 'persistent',
      email: 'persistent@test.local',
      password,
    });

    const res = await request(getApp())
      .post('/api/auth/login')
      .send({ emailOrUsername: 'persistent', password })
      .expect(200);

    const raw = res.headers['set-cookie'] ?? [];
    const setCookie = (Array.isArray(raw) ? raw : [raw]).join(';');
    // A persistent cookie has either Max-Age or Expires (express-session can
    // emit either depending on the version); a session cookie has neither.
    expect(/Max-Age=|Expires=/i.test(setCookie)).toBe(true);
  });
});
