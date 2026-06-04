import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, registerAndAuth, truncateAll } from './helpers.js';

describe('sync', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('GET /api/sync returns the legacy DB blob shape with auto-provisioned profile', async () => {
    const { agent } = await registerAndAuth();
    const res = await agent.get('/api/sync').expect(200);

    expect(res.body).toMatchObject({
      schemaVersion: 2,
      tables: { groups: [], games: [], creations: [] },
    });
    expect(Array.isArray(res.body.tables.profiles)).toBe(true);
    expect(res.body.tables.profiles.length).toBe(1); // auto-provisioned
    expect(res.body.values).toMatchObject({
      uiTheme: 'light',
      currentProfileId: res.body.tables.profiles[0].id,
    });
  });

  it('PUT /api/sync upserts groups/games/creations and is reflected by GET', async () => {
    const { agent } = await registerAndAuth();

    const sync0 = await agent.get('/api/sync').expect(200);
    const profileId: string = sync0.body.tables.profiles[0].id;

    const payload = {
      tables: {
        groups: [
          {
            id: 'grp_test_1',
            name: 'Synced Group',
            description: 'pushed via PUT',
            type: 'social',
            privacy: 'private',
            status: 'active',
            // Legacy top-level extras that should land in `data`:
            image: null,
            members: 0,
            memberProfileIds: [profileId],
            liked: true,
          },
        ],
        games: [
          {
            id: 'gam_test_1',
            name: 'Synced Game',
            hostGroupId: 'grp_test_1',
            hostGroupName: 'Synced Group',
            gameType: 'book',
            timingMode: 'infinite',
            status: 'active',
            startTime: 1700000000000,
            endTime: null,
            timingOffsets: { start: { weeks: 0, days: 0, hours: 0, mins: 0 } },
          },
        ],
        creations: [
          {
            id: 'cre_test_1',
            name: 'Synced Creation',
            hostGameId: 'gam_test_1',
            tags: 'a,b',
            timestamp: 1700000000123,
            status: 'active',
            liked: true,
          },
        ],
      },
      values: {
        uiTheme: 'dark',
        primaryGroupId: 'grp_test_1',
        currentProfileId: profileId,
      },
    };

    await agent.put('/api/sync').send(payload).expect(200);

    const sync1 = await agent.get('/api/sync').expect(200);
    const groups = sync1.body.tables.groups;
    const games = sync1.body.tables.games;
    const creations = sync1.body.tables.creations;
    expect(groups).toHaveLength(1);
    expect(games).toHaveLength(1);
    expect(creations).toHaveLength(1);

    // Top-level legacy extras flattened back out of `data`:
    expect(groups[0].liked).toBe(true);
    expect(groups[0].memberProfileIds).toEqual([profileId]);
    expect(games[0].timingOffsets.start.weeks).toBe(0);
    expect(creations[0].liked).toBe(true);
    expect(creations[0].timestamp).toBe(1700000000123);

    // Values flow through the UserSetting upsert.
    expect(sync1.body.values.uiTheme).toBe('dark');
    expect(sync1.body.values.primaryGroupId).toBe('grp_test_1');
  });

  it('PUT /api/sync DOES NOT delete server rows missing from the payload', async () => {
    const { agent } = await registerAndAuth();

    // Seed via granular endpoint
    const created = await agent.post('/api/groups').send({ name: 'Seed' }).expect(201);
    const seededId: string = created.body.group.id;

    // Push a payload that omits the seeded group entirely
    await agent
      .put('/api/sync')
      .send({ tables: { groups: [{ id: 'unrelated', name: 'Other' }] } })
      .expect(200);

    // Seeded group is still there
    const sync = await agent.get('/api/sync?').expect(200);
    const ids = sync.body.tables.groups.map((g: { id: string }) => g.id);
    expect(ids).toContain(seededId);
    expect(ids).toContain('unrelated');
  });

  it('memberProfileIds in PUT writes to join tables; GET surfaces them at top level', async () => {
    const { agent } = await registerAndAuth();
    const sync0 = await agent.get('/api/sync').expect(200);
    const profileId: string = sync0.body.values.currentProfileId;

    await agent
      .put('/api/sync')
      .send({
        tables: {
          groups: [
            { id: 'grp_with_members', name: 'Members', memberProfileIds: [profileId, 'ghost'] },
          ],
          games: [
            { id: 'gam_with_members', name: 'Match', memberProfileIds: [profileId, 'ghost'] },
          ],
        },
      })
      .expect(200);

    const sync1 = await agent.get('/api/sync').expect(200);
    const grp = sync1.body.tables.groups.find((g: { id: string }) => g.id === 'grp_with_members');
    const gam = sync1.body.tables.games.find((g: { id: string }) => g.id === 'gam_with_members');

    // Dangling 'ghost' is silently dropped on the way in.
    expect(grp.memberProfileIds).toEqual([profileId]);
    expect(grp.members).toBe(1);
    expect(gam.memberProfileIds).toEqual([profileId]);

    // memberProfileIds must NOT leak back into the data blob.
    expect(grp.data?.memberProfileIds).toBeUndefined();
    expect(gam.data?.memberProfileIds).toBeUndefined();
  });

  it('PUT /api/sync persists explicit default-group onboarding membership and default game', async () => {
    const { agent } = await registerAndAuth();
    const sync0 = await agent.get('/api/sync').expect(200);
    const profileId: string = sync0.body.values.currentProfileId;

    await agent
      .put('/api/sync')
      .send({
        tables: {
          groups: [
            {
              id: 'group_default',
              name: 'GROUP',
              description: 'Default Group',
              type: 'social',
              privacy: 'public',
              status: 'active',
              isSystemDefault: true,
              memberProfileIds: [profileId],
            },
          ],
        },
        values: {
          primaryGroupId: 'group_default',
          currentProfileId: profileId,
        },
      })
      .expect(200);

    const sync1 = await agent.get('/api/sync').expect(200);
    const defaultGroup = sync1.body.tables.groups.find((g: { id: string }) => g.id === 'group_default');
    const defaultGame = sync1.body.tables.games.find((g: { id: string }) => g.id === 'game_default');

    expect(defaultGroup.memberProfileIds).toContain(profileId);
    expect(defaultGroup.members).toBe(1);
    expect(defaultGame).toMatchObject({
      id: 'game_default',
      hostGroupId: 'group_default',
      isOnboardingDefault: true,
      fixedSettings: true,
      awardsXp: false,
    });
    expect(defaultGame.memberProfileIds).toContain(profileId);
  });

  it('timingOffsets round-trip: PUT writes to typed columns, GET expands ms back to {weeks,days,hours,mins}', async () => {
    const { agent } = await registerAndAuth();

    await agent
      .put('/api/sync')
      .send({
        tables: {
          games: [
            {
              id: 'gam_offsets',
              name: 'Timed Game',
              timingMode: 'deadline',
              timingOffsets: {
                start: { weeks: 0, days: 0, hours: 0, mins: 5 },
                submission: { weeks: 0, days: 0, hours: 23, mins: 15 },
                end: { weeks: 1, days: 2, hours: 3, mins: 0 },
              },
            },
          ],
        },
      })
      .expect(200);

    const sync = await agent.get('/api/sync').expect(200);
    const gam = sync.body.tables.games.find((g: { id: string }) => g.id === 'gam_offsets');
    expect(gam.timingOffsets).toEqual({
      start: { weeks: 0, days: 0, hours: 0, mins: 5 },
      submission: { weeks: 0, days: 0, hours: 23, mins: 15 },
      end: { weeks: 1, days: 2, hours: 3, mins: 0 },
    });
    // Must not also leak into the JSON blob — typed columns are the source of truth now.
    expect(gam.data?.timingOffsets).toBeUndefined();
  });

  it('timingExtensions: append-only reconciliation, dedupes on re-PUT, never drops history', async () => {
    const { agent } = await registerAndAuth();

    const ext1 = {
      type: 'start_extended',
      originalTime: 1700000000000,
      newTime: 1700001000000,
      extendedAt: 1700000500000,
    };
    const ext2 = {
      type: 'end_extended',
      originalTime: 1700009000000,
      newTime: 1700099000000,
      extendedAt: 1700050000000,
    };
    const ext3 = {
      type: 'future_start',
      scheduledFor: 1800000000000,
      setAt: 1700060000000,
    };

    // First PUT: two events.
    await agent
      .put('/api/sync')
      .send({
        tables: {
          games: [{ id: 'gam_ext', name: 'Ext Game', timingExtensions: [ext1, ext2] }],
        },
      })
      .expect(200);

    // Second PUT: same array (frontend re-sends history) + a new event.
    // Server must NOT duplicate ext1/ext2 and must accept ext3.
    await agent
      .put('/api/sync')
      .send({
        tables: {
          games: [{ id: 'gam_ext', name: 'Ext Game', timingExtensions: [ext1, ext2, ext3] }],
        },
      })
      .expect(200);

    // Third PUT: empty array (the "edited a non-timing field" case).
    // Server must NOT wipe the three already-stored entries.
    await agent
      .put('/api/sync')
      .send({
        tables: { games: [{ id: 'gam_ext', name: 'Ext Game', timingExtensions: [] }] },
      })
      .expect(200);

    const sync = await agent.get('/api/sync').expect(200);
    const gam = sync.body.tables.games.find((g: { id: string }) => g.id === 'gam_ext');
    expect(gam.timingExtensions).toHaveLength(3);

    // Returned in chronological order (happenedAt asc).
    const types = gam.timingExtensions.map((e: { type: string }) => e.type);
    expect(types).toEqual(['start_extended', 'end_extended', 'future_start']);

    // Wire-shape per type:
    expect(gam.timingExtensions[0]).toMatchObject({
      type: 'start_extended',
      originalTime: 1700000000000,
      newTime: 1700001000000,
      extendedAt: 1700000500000,
    });
    expect(gam.timingExtensions[2]).toMatchObject({
      type: 'future_start',
      scheduledFor: 1800000000000,
      setAt: 1700060000000,
    });

    // Must not also leak into the JSON blob.
    expect(gam.data?.timingExtensions).toBeUndefined();
  });

  it('creation `image` round-trips through PUT/GET /api/sync as a top-level field', async () => {
    // The legacy frontend writes the image as a base64 data URL on the
    // creation row itself (not as an Asset reference, yet). The bulk sync
    // path must persist it via `collectExtras` -> `Creation.data.image` and
    // re-surface it via `creationToLegacy`'s data-spread. Regression for the
    // "creation image disappears in versus / SU" platform-wide bug.
    const { agent } = await registerAndAuth();
    const sync0 = await agent.get('/api/sync').expect(200);
    const profileId: string = sync0.body.values.currentProfileId;

    const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    await agent
      .put('/api/sync')
      .send({
        tables: {
          creations: [
            {
              id: 'cre_with_image',
              name: 'With image',
              ownerProfileId: profileId,
              status: 'active',
              timestamp: 1700000000123,
              image: img,
            },
          ],
        },
      })
      .expect(200);

    const sync1 = await agent.get('/api/sync').expect(200);
    const row = sync1.body.tables.creations.find((c: { id: string }) => c.id === 'cre_with_image');
    expect(row).toBeDefined();
    expect(row.image).toBe(img);

    // A subsequent PUT that omits `image` must NOT clobber the stored copy
    // — bulkReplace merges `data` instead of doing a wholesale overwrite,
    // matching the granular-endpoint contract.
    await agent
      .put('/api/sync')
      .send({
        tables: {
          creations: [
            {
              id: 'cre_with_image',
              name: 'With image v2',
              ownerProfileId: profileId,
              status: 'active',
              timestamp: 1700000000123,
            },
          ],
        },
      })
      .expect(200);

    const sync2 = await agent.get('/api/sync').expect(200);
    const row2 = sync2.body.tables.creations.find((c: { id: string }) => c.id === 'cre_with_image');
    expect(row2.name).toBe('With image v2');
    expect(row2.image).toBe(img);
  });

  it('PUT /api/sync silently rejects cross-profile id takeover', async () => {
    const userA = await registerAndAuth();
    const userB = await registerAndAuth();

    await userA.agent
      .put('/api/sync')
      .send({ tables: { groups: [{ id: 'grp_x', name: 'A row' }] } })
      .expect(200);

    // User B tries to overwrite the same id: request succeeds but the
    // upsert is skipped because the row is already owned by A.
    await userB.agent
      .put('/api/sync')
      .send({ tables: { groups: [{ id: 'grp_x', name: 'B took it' }] } })
      .expect(200);

    const a = await userA.agent.get('/api/sync').expect(200);
    const b = await userB.agent.get('/api/sync').expect(200);

    const aRow = a.body.tables.groups.find((g: { id: string }) => g.id === 'grp_x');
    expect(aRow).toBeDefined();
    expect(aRow.name).toBe('A row'); // unchanged by B's attempt

    const bIds = b.body.tables.groups.map((g: { id: string }) => g.id);
    expect(bIds).not.toContain('grp_x');
  });
});
