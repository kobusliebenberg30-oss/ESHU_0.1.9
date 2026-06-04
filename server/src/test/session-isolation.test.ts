/**
 * Session / user isolation invariants.
 *
 * Pins down two cross-cutting guarantees that the manual smoke flow tends
 * to expose:
 *
 *   1. UserSetting.data (which holds profile-scoped flat keys like
 *      readMessageIds_<pid>, earnedMilestones_<pid>, creationUploadUnlocked_<pid>)
 *      is NEVER shared across users. One user's onboarding read state cannot
 *      pollute another user's snapshot.
 *
 *   2. Logging out (destroying the session) followed by registering a new
 *      account yields a snapshot whose currentProfileId differs from the
 *      previous user's, and contains zero memberships inherited from the
 *      previous user.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getApp, registerAndAuth, truncateAll } from './helpers.js';
import request from 'supertest';

const DEFAULT_GROUP_ID = 'group_default';

describe('session isolation', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('two users have independent UserSetting.data', async () => {
    const a = await registerAndAuth();
    const b = await registerAndAuth();

    // Each user pushes a distinct scoped flag through /api/sync.
    const syncA0 = await a.agent.get('/api/sync').expect(200);
    const profileIdA: string = syncA0.body.values.currentProfileId;
    await a.agent
      .put('/api/sync')
      .send({
        values: {
          currentProfileId: profileIdA,
          [`readMessageIds_${profileIdA}`]: ['proto-a-v1', 'onboard-join-group'],
        },
      })
      .expect(200);

    const syncB0 = await b.agent.get('/api/sync').expect(200);
    const profileIdB: string = syncB0.body.values.currentProfileId;
    await b.agent
      .put('/api/sync')
      .send({
        values: {
          currentProfileId: profileIdB,
          [`readMessageIds_${profileIdB}`]: ['proto-a-v1'],
        },
      })
      .expect(200);

    // Now pull each user's snapshot and assert no cross-contamination.
    const syncA1 = await a.agent.get('/api/sync').expect(200);
    const syncB1 = await b.agent.get('/api/sync').expect(200);

    expect(syncA1.body.values[`readMessageIds_${profileIdA}`]).toEqual([
      'proto-a-v1',
      'onboard-join-group',
    ]);
    expect(syncA1.body.values[`readMessageIds_${profileIdB}`]).toBeUndefined();

    expect(syncB1.body.values[`readMessageIds_${profileIdB}`]).toEqual(['proto-a-v1']);
    expect(syncB1.body.values[`readMessageIds_${profileIdA}`]).toBeUndefined();
  });

  it('logout then fresh register yields a clean snapshot', async () => {
    // Drive both users through the same supertest agent so we exercise the
    // logout + new-session flow within a single cookie jar — same as a real
    // browser tab that the user clicks through.
    const app = getApp();
    const agent = request.agent(app);

    const suffixA = Math.random().toString(36).slice(2, 8);
    await agent
      .post('/api/auth/register')
      .send({ email: `cycle_a_${suffixA}@test.local`, username: `cycle_a_${suffixA}`, password: 'hunter2hunter2' })
      .expect(201);

    const aSync = await agent.get('/api/sync').expect(200);
    const profileIdA: string = aSync.body.values.currentProfileId;
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);

    // Sanity: A is now a member of the default group.
    const aSync2 = await agent.get('/api/sync').expect(200);
    const aDefaultGroup = aSync2.body.tables.groups.find((g: { id: string }) => g.id === DEFAULT_GROUP_ID);
    expect(aDefaultGroup.memberProfileIds).toContain(profileIdA);

    // Logout, then register a fresh user on the same agent (same cookie jar).
    await agent.post('/api/auth/logout').expect(204);

    // Post-logout pulls must reject (no session).
    await agent.get('/api/sync').expect(401);

    const suffixB = Math.random().toString(36).slice(2, 8);
    await agent
      .post('/api/auth/register')
      .send({ email: `cycle_b_${suffixB}@test.local`, username: `cycle_b_${suffixB}`, password: 'hunter2hunter2' })
      .expect(201);

    const bSync = await agent.get('/api/sync').expect(200);
    const profileIdB: string = bSync.body.values.currentProfileId;
    expect(profileIdB).not.toBe(profileIdA);

    // B's snapshot should contain ZERO default-group membership (B has not
    // joined yet) and should NOT include any of A's scoped flags.
    const bDefaultGroup = bSync.body.tables.groups.find((g: { id: string }) => g.id === DEFAULT_GROUP_ID);
    if (bDefaultGroup) {
      expect(bDefaultGroup.memberProfileIds || []).not.toContain(profileIdA);
      expect(bDefaultGroup.memberProfileIds || []).not.toContain(profileIdB);
    }
    expect(bSync.body.values[`readMessageIds_${profileIdA}`]).toBeUndefined();
    expect(bSync.body.values[`earnedMilestones_${profileIdA}`]).toBeUndefined();
  });
});
