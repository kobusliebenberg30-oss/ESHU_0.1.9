import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, registerAndAuth, truncateAll } from './helpers.js';

describe('games', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('persists the legacy inline image across create, partial update, and /api/sync', async () => {
    const { agent } = await registerAndAuth();

    const imgA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const imgB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // Create with an inline image. No hostGroupId so the membership gate is
    // skipped; we only care that `image` round-trips through the granular
    // create/update path.
    const created = await agent
      .post('/api/games')
      .send({
        name: 'Cover game',
        gameType: 'book',
        timingMode: 'infinite',
        status: 'active',
        privacy: 'public',
        image: imgA,
      })
      .expect(201);
    const id: string = created.body.game.id;
    expect(created.body.game.image).toBe(imgA);

    // PATCH only the name. Image must NOT be clobbered (regression: server
    // previously dropped `image`, then /api/sync overwrote local state with
    // an imageless row).
    const renamed = await agent
      .patch(`/api/games/${id}`)
      .send({ name: 'Cover game v2' })
      .expect(200);
    expect(renamed.body.game.name).toBe('Cover game v2');
    expect(renamed.body.game.image).toBe(imgA);

    // /api/sync snapshot must surface image at the top level.
    const snap = await agent.get('/api/sync').expect(200);
    const row = snap.body.tables.games.find((g: { id: string }) => g.id === id);
    expect(row.image).toBe(imgA);

    // Replace the image; PATCH must take effect.
    const reimaged = await agent
      .patch(`/api/games/${id}`)
      .send({ image: imgB })
      .expect(200);
    expect(reimaged.body.game.image).toBe(imgB);

    // Explicit clear via empty string.
    const cleared = await agent
      .patch(`/api/games/${id}`)
      .send({ image: '' })
      .expect(200);
    expect(cleared.body.game.image).toBeNull();
  });
});
