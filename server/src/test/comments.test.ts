import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, registerAndAuth, truncateAll } from './helpers.js';

describe('comments', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('creates, lists, and round-trips a comment on a creation across sessions', async () => {
    // Author posts a comment on a creation target. The list endpoint is
    // parameterised by (targetKind, targetId) so a single client call
    // hydrates the entire thread — replacing the legacy localStorage scan.
    const author = await registerAndAuth();
    const profileId: string = (await author.agent.get('/api/profiles').expect(200)).body.currentProfileId;

    const created = await author.agent
      .post('/api/comments')
      .send({
        targetKind: 'creation',
        targetId: 'cre_under_test',
        text: 'first comment',
      })
      .expect(201);
    expect(created.body.comment).toMatchObject({
      authorProfileId: profileId,
      targetKind: 'creation',
      targetId: 'cre_under_test',
      text: 'first comment',
      status: 'active',
      likedBy: [],
      followedBy: [],
    });

    const list = await author.agent
      .get('/api/comments?targetKind=creation&targetId=cre_under_test')
      .expect(200);
    expect(list.body.comments).toHaveLength(1);
    expect(list.body.comments[0].text).toBe('first comment');

    // Logout, log back in — comment must still be there. This is the
    // critical guarantee the localStorage implementation never provided.
    await author.agent.post('/api/auth/logout').expect(204);

    const reAuthed = await registerAndAuth({}); // a brand-new user
    const visibleToOther = await reAuthed.agent
      .get('/api/comments?targetKind=creation&targetId=cre_under_test')
      .expect(200);
    // Comments are public-readable (visibility lives at the parent layer).
    // The new user should see the original author's comment.
    expect(visibleToOther.body.comments).toHaveLength(1);
    expect(visibleToOther.body.comments[0].authorProfileId).toBe(profileId);
  });

  it('toggles likedBy / followedBy server-side, idempotently and per-profile', async () => {
    const a = await registerAndAuth();
    const b = await registerAndAuth();
    const aProfile: string = (await a.agent.get('/api/profiles').expect(200)).body.currentProfileId;
    const bProfile: string = (await b.agent.get('/api/profiles').expect(200)).body.currentProfileId;

    const created = await a.agent
      .post('/api/comments')
      .send({ targetKind: 'group', targetId: 'grp_x', text: 'pin me' })
      .expect(201);
    const id: string = created.body.comment.id;

    // Profile B likes the comment. likedBy now contains B's profile id.
    const liked = await b.agent.post(`/api/comments/${id}/like`).expect(200);
    expect(liked.body.comment.likedBy).toEqual([bProfile]);

    // Profile A likes too. Both ids in order.
    const liked2 = await a.agent.post(`/api/comments/${id}/like`).expect(200);
    expect(liked2.body.comment.likedBy).toEqual([bProfile, aProfile]);

    // Profile B toggles again (unlikes). Only A remains.
    const unliked = await b.agent.post(`/api/comments/${id}/like`).expect(200);
    expect(unliked.body.comment.likedBy).toEqual([aProfile]);

    // Follow toggling uses the same machinery.
    const followed = await b.agent.post(`/api/comments/${id}/follow`).expect(200);
    expect(followed.body.comment.followedBy).toEqual([bProfile]);
  });

  it('only the author can edit or soft-delete their comment', async () => {
    const a = await registerAndAuth();
    const b = await registerAndAuth();
    const created = await a.agent
      .post('/api/comments')
      .send({ targetKind: 'game', targetId: 'gam_x', text: 'mine' })
      .expect(201);
    const id: string = created.body.comment.id;

    const fromOther = await b.agent.patch(`/api/comments/${id}`).send({ text: 'hijack' });
    expect(fromOther.status).toBe(403);

    const deleteFromOther = await b.agent.delete(`/api/comments/${id}`);
    expect(deleteFromOther.status).toBe(403);

    // Author can edit. editedAt is populated.
    const edited = await a.agent.patch(`/api/comments/${id}`).send({ text: 'mine (edited)' }).expect(200);
    expect(edited.body.comment.text).toBe('mine (edited)');
    expect(edited.body.comment.editedAt).not.toBeNull();

    // Author can soft-delete.
    const deleted = await a.agent.delete(`/api/comments/${id}`).expect(200);
    expect(deleted.body.comment.status).toBe('deleted');

    // Default list filter (status=active) hides the deleted row.
    const visible = await a.agent
      .get('/api/comments?targetKind=game&targetId=gam_x')
      .expect(200);
    expect(visible.body.comments).toHaveLength(0);

    // status=all surfaces it again.
    const all = await a.agent
      .get('/api/comments?targetKind=game&targetId=gam_x&status=all')
      .expect(200);
    expect(all.body.comments).toHaveLength(1);
  });

  it('soft-delete with mode=burned is distinguishable from default delete', async () => {
    const { agent } = await registerAndAuth();
    const created = await agent
      .post('/api/comments')
      .send({ targetKind: 'creation', targetId: 'cre_y', text: 'burn me' })
      .expect(201);
    const id: string = created.body.comment.id;

    const burned = await agent.delete(`/api/comments/${id}?mode=burned`).expect(200);
    expect(burned.body.comment.status).toBe('burned');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { agent } = await registerAndAuth();
    await agent.post('/api/auth/logout').expect(204);
    const res = await agent.get('/api/comments?targetKind=creation&targetId=anything');
    expect(res.status).toBe(401);
  });
});
