/**
 * Onboarding XP calibration invariants.
 *
 * Pins the contract that joining `group_default` grants exactly the same XP
 * a player would earn for creating their own first game, idempotently, so
 * the default and self-create onboarding paths converge at the same XP gate
 * (upload_creations at 2 XP, comments at 3 XP).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, registerAndAuth, truncateAll } from './helpers.js';

const DEFAULT_GROUP_ID = 'group_default';
const GAME_CREATED_XP = 2; // mirrors RULES.game_created.amount in xp.service.ts
const UPLOAD_CREATIONS_THRESHOLD = 2;
const COMMENTS_THRESHOLD = 3;

describe('onboarding XP calibration', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('joining the default group grants game_created XP exactly once', async () => {
    const { agent } = await registerAndAuth();

    const gates0 = await agent.get('/api/xp/gates').expect(200);
    expect(gates0.body.xpPoints).toBe(0);
    expect(gates0.body.unlocks).not.toContain('upload_creations');

    // First join awards the XP.
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);

    const gates1 = await agent.get('/api/xp/gates').expect(200);
    expect(gates1.body.xpPoints).toBe(GAME_CREATED_XP);
    expect(gates1.body.xpPoints).toBeGreaterThanOrEqual(UPLOAD_CREATIONS_THRESHOLD);
    expect(gates1.body.unlocks).toContain('upload_creations');
    expect(gates1.body.unlocks).not.toContain('comments');

    // Second join is a no-op for XP (idempotent ledger on (kind, refId)).
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);

    const gates2 = await agent.get('/api/xp/gates').expect(200);
    expect(gates2.body.xpPoints).toBe(GAME_CREATED_XP);
  });

  it('default path and self-create path converge at the same XP', async () => {
    // Path A: a user who joins the default group only.
    const a = await registerAndAuth();
    await a.agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    const aGates = await a.agent.get('/api/xp/gates').expect(200);

    // Path B: a user who skips the default group join and creates their own
    // game directly. Their XP awarder is the `/api/xp/award` endpoint that
    // the games.page.js client calls right after a successful POST /games.
    const b = await registerAndAuth();
    const created = await b.agent
      .post('/api/games')
      .send({
        name: 'Path B Game',
        description: 'self-create onboarding',
        gameType: 'book',
        timingMode: 'infinite',
        status: 'active',
        privacy: 'public',
      })
      .expect(201);
    await b.agent
      .post('/api/xp/award')
      .send({ kind: 'game_created', refId: created.body.game.id })
      .expect(200);
    const bGates = await b.agent.get('/api/xp/gates').expect(200);

    expect(aGates.body.xpPoints).toBe(bGates.body.xpPoints);
    expect(aGates.body.unlocks.sort()).toEqual(bGates.body.unlocks.sort());
  });

  it('joining default + uploading one creation crosses the comments threshold', async () => {
    const { agent } = await registerAndAuth();

    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);

    // Simulate a creation upload by awarding `creation_uploaded`.
    // (The client awards this after a successful POST /api/creations.)
    await agent
      .post('/api/xp/award')
      .send({ kind: 'creation_uploaded', refId: 'creation_dummy_a' })
      .expect(200);

    const gates = await agent.get('/api/xp/gates').expect(200);
    expect(gates.body.xpPoints).toBeGreaterThanOrEqual(COMMENTS_THRESHOLD);
    expect(gates.body.unlocks).toContain('comments');
  });

  it('self-create path: uploading to own game also crosses the comments threshold', async () => {
    // The "didn't join the default group, made my own game" path. Same end
    // state as the default path: 2 XP from game_created + 1 XP from
    // creation_uploaded = 3 XP, which unlocks comments.
    const { agent } = await registerAndAuth();

    const created = await agent
      .post('/api/games')
      .send({
        name: 'Solo Path Game',
        description: 'self-create onboarding',
        gameType: 'book',
        timingMode: 'infinite',
        status: 'active',
        privacy: 'public',
      })
      .expect(201);
    await agent
      .post('/api/xp/award')
      .send({ kind: 'game_created', refId: created.body.game.id })
      .expect(200);
    await agent
      .post('/api/xp/award')
      .send({ kind: 'creation_uploaded', refId: 'creation_dummy_solo' })
      .expect(200);

    const gates = await agent.get('/api/xp/gates').expect(200);
    expect(gates.body.xpPoints).toBeGreaterThanOrEqual(COMMENTS_THRESHOLD);
    expect(gates.body.unlocks).toContain('comments');
  });
});

const DEFAULT_GAME_ID = 'game_default';

describe('default group + game immutability', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('rejects PATCH on the default group', async () => {
    const { agent } = await registerAndAuth();
    // Materialise the default group via join.
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    const res = await agent
      .patch(`/api/groups/${DEFAULT_GROUP_ID}`)
      .send({ name: 'Tampered' })
      .expect(403);
    expect(res.body?.error ?? res.body?.message ?? '').toMatch(/SYSTEM_DEFAULT_IMMUTABLE/);
  });

  it('rejects DELETE on the default group', async () => {
    const { agent } = await registerAndAuth();
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    await agent.delete(`/api/groups/${DEFAULT_GROUP_ID}`).expect(403);
  });

  it('rejects PATCH on the default game', async () => {
    const { agent } = await registerAndAuth();
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    const res = await agent
      .patch(`/api/games/${DEFAULT_GAME_ID}`)
      .send({ name: 'Tampered' })
      .expect(403);
    expect(res.body?.error ?? res.body?.message ?? '').toMatch(/SYSTEM_DEFAULT_IMMUTABLE/);
  });

  it('rejects DELETE on the default game', async () => {
    const { agent } = await registerAndAuth();
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    await agent.delete(`/api/games/${DEFAULT_GAME_ID}`).expect(403);
  });
});

describe('bulk sync onboarding XP parity', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('joining default group via PUT /api/sync awards the same onboarding XP as POST /join', async () => {
    // Reproduces the bug where a snapshot-push joiner ended up at 0 XP and
    // therefore could never cross the comments unlock with a single upload.
    const { agent } = await registerAndAuth();

    const gates0 = await agent.get('/api/xp/gates').expect(200);
    expect(gates0.body.xpPoints).toBe(0);

    // Push a legacy-style snapshot that places the caller into group_default.
    await agent
      .put('/api/sync')
      .send({
        tables: {
          groups: [
            {
              id: DEFAULT_GROUP_ID,
              name: 'GROUP',
              isSystemDefault: true,
              memberProfileIds: [gates0.body.profileId],
            },
          ],
        },
      })
      .expect(200);

    const gates1 = await agent.get('/api/xp/gates').expect(200);
    expect(gates1.body.xpPoints).toBe(2);
    expect(gates1.body.unlocks).toContain('upload_creations');

    // Idempotent: a second sync with the same payload must not double-grant.
    await agent
      .put('/api/sync')
      .send({
        tables: {
          groups: [
            {
              id: DEFAULT_GROUP_ID,
              name: 'GROUP',
              isSystemDefault: true,
              memberProfileIds: [gates0.body.profileId],
            },
          ],
        },
      })
      .expect(200);

    const gates2 = await agent.get('/api/xp/gates').expect(200);
    expect(gates2.body.xpPoints).toBe(2);
  });
});
