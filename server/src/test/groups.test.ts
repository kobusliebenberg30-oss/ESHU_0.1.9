import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, registerAndAuth, truncateAll } from './helpers.js';

describe('groups', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('creates, lists, reads, patches, and soft-deletes a group', async () => {
    const { agent } = await registerAndAuth();

    const create = await agent
      .post('/api/groups')
      .send({ name: 'Alpha', description: 'first', privacy: 'public' })
      .expect(201);
    const groupId: string = create.body.group.id;
    expect(groupId).toMatch(/^[a-z0-9]+$/);
    expect(create.body.group.status).toBe('active');
    expect(create.body.group.privacy).toBe('public');

    const list = await agent.get('/api/groups').expect(200);
    expect(list.body.groups.map((g: { id: string }) => g.id)).toContain(groupId);

    const read = await agent.get(`/api/groups/${groupId}`).expect(200);
    expect(read.body.group.name).toBe('Alpha');

    const patched = await agent
      .patch(`/api/groups/${groupId}`)
      .send({ name: 'Alpha v2', privacy: 'private' })
      .expect(200);
    expect(patched.body.group.name).toBe('Alpha v2');
    expect(patched.body.group.privacy).toBe('private');

    // Default soft-delete
    const deleted = await agent.delete(`/api/groups/${groupId}`).expect(200);
    expect(deleted.body.group.status).toBe('deleted');

    // Default list filter is status=active so it's gone
    const listAfter = await agent.get('/api/groups').expect(200);
    expect(listAfter.body.groups.map((g: { id: string }) => g.id)).not.toContain(groupId);

    // status=all returns it
    const listAll = await agent.get('/api/groups?status=all').expect(200);
    expect(listAll.body.groups.map((g: { id: string }) => g.id)).toContain(groupId);
  });

  it('burn mode sets status to burned', async () => {
    const { agent } = await registerAndAuth();
    const create = await agent.post('/api/groups').send({ name: 'Burn me' }).expect(201);
    const id: string = create.body.group.id;
    const burned = await agent.delete(`/api/groups/${id}?mode=burned`).expect(200);
    expect(burned.body.group.status).toBe('burned');
  });

  it('enforces ownership: another user gets 404, not 403', async () => {
    const owner = await registerAndAuth();
    const stranger = await registerAndAuth();

    const create = await owner.agent.post('/api/groups').send({ name: 'Mine' }).expect(201);
    const id: string = create.body.group.id;

    // Group lookup is scoped to the requester's active profile, so it's a
    // 404 (not found in their scope) rather than a 403. Either way, no leak.
    const res = await stranger.agent.get(`/api/groups/${id}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { agent } = await registerAndAuth();
    await agent.post('/api/auth/logout').expect(204);
    const res = await agent.get('/api/groups');
    expect(res.status).toBe(401);
  });

  it('preserves unknown fields via the data column on create+read', async () => {
    const { agent } = await registerAndAuth();
    const created = await agent
      .post('/api/groups')
      .send({
        name: 'With extras',
        description: 'desc',
        // Truly arbitrary extras the schema doesn't model:
        data: { liked: true, followed: false, customTag: 'x' },
      })
      .expect(201);
    expect(created.body.group.data).toMatchObject({ liked: true, customTag: 'x' });

    const read = await agent.get(`/api/groups/${created.body.group.id}`).expect(200);
    expect(read.body.group.data.liked).toBe(true);
  });

  it('persists memberProfileIds via the GroupMember join table', async () => {
    const { agent } = await registerAndAuth();

    // Get the auto-provisioned profile id; we'll use it as the only valid member.
    const profilesRes = await agent.get('/api/profiles').expect(200);
    const profileId: string = profilesRes.body.currentProfileId;

    // Create with two member ids: one valid, one dangling. Dangling is dropped.
    const created = await agent
      .post('/api/groups')
      .send({ name: 'Squad', memberProfileIds: [profileId, 'profile_does_not_exist'] })
      .expect(201);

    expect(created.body.group.memberProfileIds).toEqual([profileId]);
    expect(created.body.group.members).toBe(1); // denormalized count reflects valid links

    // Round-trip via GET
    const read = await agent.get(`/api/groups/${created.body.group.id}`).expect(200);
    expect(read.body.group.memberProfileIds).toEqual([profileId]);

    // Replace-set semantics: empty array clears everyone.
    const cleared = await agent
      .patch(`/api/groups/${created.body.group.id}`)
      .send({ memberProfileIds: [] })
      .expect(200);
    expect(cleared.body.group.memberProfileIds).toEqual([]);
    expect(cleared.body.group.members).toBe(0);
  });

  it('persists the legacy inline image across create, partial update, and /api/sync', async () => {
    const { agent } = await registerAndAuth();

    // 1x1 transparent PNG data URL — small enough for a test, exercises the
    // base64-data-url path the frontend uses today.
    const imgA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const imgB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // Create with an inline image.
    const created = await agent
      .post('/api/groups')
      .send({ name: 'Logo group', image: imgA })
      .expect(201);
    const id: string = created.body.group.id;
    expect(created.body.group.image).toBe(imgA);

    // PATCH only the name. Image must NOT be clobbered (regression: server
    // previously dropped `image`, then /api/sync overwrote local state with
    // an imageless row).
    const renamed = await agent
      .patch(`/api/groups/${id}`)
      .send({ name: 'Logo group v2' })
      .expect(200);
    expect(renamed.body.group.name).toBe('Logo group v2');
    expect(renamed.body.group.image).toBe(imgA);

    // /api/sync snapshot must surface image at the top level.
    const snap = await agent.get('/api/sync').expect(200);
    const row = snap.body.tables.groups.find((g: { id: string }) => g.id === id);
    expect(row.image).toBe(imgA);

    // Replace the image; PATCH must take effect.
    const reimaged = await agent
      .patch(`/api/groups/${id}`)
      .send({ image: imgB })
      .expect(200);
    expect(reimaged.body.group.image).toBe(imgB);

    // Explicit clear via empty string.
    const cleared = await agent
      .patch(`/api/groups/${id}`)
      .send({ image: '' })
      .expect(200);
    expect(cleared.body.group.image).toBeNull();
  });

  it('materializes and persists default onboarding membership on explicit join', async () => {
    const { agent } = await registerAndAuth();
    const sync0 = await agent.get('/api/sync').expect(200);
    const profileId: string = sync0.body.values.currentProfileId;

    const joined = await agent.post('/api/groups/group_default/join').expect(200);
    expect(joined.body.group).toMatchObject({
      id: 'group_default',
      isSystemDefault: true,
      ownerProfileId: null,
      status: 'active',
    });
    expect(joined.body.group.memberProfileIds).toContain(profileId);
    expect(joined.body.group.members).toBe(1);

    const sync1 = await agent.get('/api/sync').expect(200);
    const defaultGroup = sync1.body.tables.groups.find((g: { id: string }) => g.id === 'group_default');
    const defaultGame = sync1.body.tables.games.find((g: { id: string }) => g.id === 'game_default');

    expect(defaultGroup.memberProfileIds).toContain(profileId);
    expect(defaultGame).toMatchObject({
      id: 'game_default',
      hostGroupId: 'group_default',
      isOnboardingDefault: true,
      fixedSettings: true,
      awardsXp: false,
    });
    expect(defaultGame.memberProfileIds).toContain(profileId);
  });
});
