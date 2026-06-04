/**
 * Database invariants — Phase 3.
 *
 * These tests pin down the contracts the persistence layer is expected to
 * uphold regardless of which client called which endpoint. If any of these
 * break, onboarding and membership logic will desynchronize. The tests
 * deliberately reach into Prisma to assert on raw row state in addition to
 * the wire response, so a regression in the join-table writes can't hide
 * behind a healthy-looking REST response.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, registerAndAuth, truncateAll } from './helpers.js';
import { prisma } from '../db/client.js';

const DEFAULT_GROUP_ID = 'group_default';
const DEFAULT_GAME_ID = 'game_default';

describe('db invariants', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('migrations table reports a fully applied baseline', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC`;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.finished_at).not.toBeNull();
      expect(row.rolled_back_at).toBeNull();
    }
  });

  it('default-group join writes both GroupMember and GameMember rows', async () => {
    const { agent } = await registerAndAuth();
    const sync = await agent.get('/api/sync').expect(200);
    const profileId: string = sync.body.values.currentProfileId;

    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);

    const [groupMember, gameMember] = await Promise.all([
      prisma.groupMember.findUnique({
        where: { groupId_profileId: { groupId: DEFAULT_GROUP_ID, profileId } },
      }),
      prisma.gameMember.findUnique({
        where: { gameId_profileId: { gameId: DEFAULT_GAME_ID, profileId } },
      }),
    ]);
    expect(groupMember).not.toBeNull();
    expect(gameMember).not.toBeNull();
  });

  it('Group.members count stays in sync with GroupMember row count', async () => {
    const a = await registerAndAuth();
    const b = await registerAndAuth();

    await a.agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    await b.agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);

    const group = await prisma.group.findUniqueOrThrow({ where: { id: DEFAULT_GROUP_ID } });
    const count = await prisma.groupMember.count({ where: { groupId: DEFAULT_GROUP_ID } });
    expect(group.members).toBe(count);
    expect(group.members).toBe(2);
  });

  it('one user\'s bulk sync push cannot decrease another user\'s system-default membership', async () => {
    const a = await registerAndAuth();
    const b = await registerAndAuth();

    // Both users join the default group via authoritative endpoints.
    await a.agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    await b.agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);

    const beforeCount = await prisma.groupMember.count({ where: { groupId: DEFAULT_GROUP_ID } });
    expect(beforeCount).toBe(2);

    // User A pushes a snapshot that *omits* B from memberProfileIds. The
    // additive system-default policy must reject this drop.
    const syncA = await a.agent.get('/api/sync').expect(200);
    const profileIdA: string = syncA.body.values.currentProfileId;

    await a.agent
      .put('/api/sync')
      .send({
        tables: {
          groups: [
            {
              id: DEFAULT_GROUP_ID,
              name: 'GROUP',
              description: 'Default Group',
              type: 'social',
              privacy: 'public',
              status: 'active',
              isSystemDefault: true,
              memberProfileIds: [profileIdA],
            },
          ],
        },
        values: { currentProfileId: profileIdA },
      })
      .expect(200);

    const afterCount = await prisma.groupMember.count({ where: { groupId: DEFAULT_GROUP_ID } });
    expect(afterCount).toBe(2);
  });

  it('deleting a profile cascades memberships but leaves the system-default group/game intact', async () => {
    const { agent } = await registerAndAuth();
    const sync = await agent.get('/api/sync').expect(200);
    const profileId: string = sync.body.values.currentProfileId;
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);

    // Delete the profile directly; the cascade rules in schema.prisma should
    // remove GroupMember/GameMember rows without touching the system-default
    // entities themselves.
    await prisma.profile.delete({ where: { id: profileId } });

    const [memberRow, gameMemberRow, group, game] = await Promise.all([
      prisma.groupMember.findUnique({
        where: { groupId_profileId: { groupId: DEFAULT_GROUP_ID, profileId } },
      }),
      prisma.gameMember.findUnique({
        where: { gameId_profileId: { gameId: DEFAULT_GAME_ID, profileId } },
      }),
      prisma.group.findUnique({ where: { id: DEFAULT_GROUP_ID } }),
      prisma.game.findUnique({ where: { id: DEFAULT_GAME_ID } }),
    ]);
    expect(memberRow).toBeNull();
    expect(gameMemberRow).toBeNull();
    expect(group).not.toBeNull();
    expect(game).not.toBeNull();
  });

  it('survives a simulated server restart by reconnecting Prisma between mutations', async () => {
    const { agent } = await registerAndAuth();
    await agent.post(`/api/groups/${DEFAULT_GROUP_ID}/join`).expect(200);
    const sync = await agent.get('/api/sync').expect(200);
    const profileId: string = sync.body.values.currentProfileId;

    // Simulate a restart: disconnect Prisma, reconnect, ensure rows persist.
    await prisma.$disconnect();
    await prisma.$connect();

    const groupMember = await prisma.groupMember.findUnique({
      where: { groupId_profileId: { groupId: DEFAULT_GROUP_ID, profileId } },
    });
    expect(groupMember).not.toBeNull();
  });
});
