import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, registerAndAuth, truncateAll } from './helpers.js';

describe('profiles', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('PATCH /api/profiles/:id merges `data` instead of replacing it', async () => {
    // The legacy frontend only sends the keys it changed (e.g. `{ image }`).
    // Previously the server wholesale-replaced `data`, so saving a new avatar
    // also silently wiped any other profile-scoped keys — and saving anything
    // *else* without re-sending `image` wiped the avatar. Merge semantics
    // make partial updates safe by definition.
    const { agent } = await registerAndAuth();
    const profilesRes = await agent.get('/api/profiles').expect(200);
    const profileId: string = profilesRes.body.currentProfileId;

    // Step 1: write a multi-key data blob.
    await agent
      .patch(`/api/profiles/${profileId}`)
      .send({
        data: {
          image: 'data:image/png;base64,AAAA',
          bio: 'first',
          favoriteColor: 'cyan',
        },
      })
      .expect(200);

    // Step 2: partial update — change bio only. Image + favoriteColor must
    // persist untouched.
    const patch = await agent
      .patch(`/api/profiles/${profileId}`)
      .send({ data: { bio: 'second' } })
      .expect(200);

    expect(patch.body.profile.data).toMatchObject({
      image: 'data:image/png;base64,AAAA',
      bio: 'second',
      favoriteColor: 'cyan',
    });

    // Step 3: explicit clear of one key by sending null. Other keys
    // still survive.
    const cleared = await agent
      .patch(`/api/profiles/${profileId}`)
      .send({ data: { favoriteColor: null } })
      .expect(200);
    expect(cleared.body.profile.data).toMatchObject({
      image: 'data:image/png;base64,AAAA',
      bio: 'second',
      favoriteColor: null,
    });

    // Step 4: GET via /api/sync should expose the same merged blob. The
    // legacy wire shape flattens `profile.data` to top-level keys (the
    // frontend reads `profile.image`, `profile.bio`, etc. directly), so we
    // assert on the flattened representation here.
    const sync = await agent.get('/api/sync').expect(200);
    const profile = sync.body.tables.profiles.find((p: { id: string }) => p.id === profileId);
    expect(profile).toBeDefined();
    expect(profile).toMatchObject({
      image: 'data:image/png;base64,AAAA',
      bio: 'second',
      favoriteColor: null,
    });
  });

  it('PATCH /api/profiles/:id accepts avatarAssetId and round-trips it through /api/sync', async () => {
    const { agent } = await registerAndAuth();
    const profileId: string = (await agent.get('/api/profiles').expect(200)).body.currentProfileId;

    const pngPixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = await agent
      .post('/api/assets')
      .attach('file', pngPixel, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201);
    const assetId: string = upload.body.asset.id;

    // Attach the avatar.
    const attach = await agent
      .patch(`/api/profiles/${profileId}`)
      .send({ avatarAssetId: assetId })
      .expect(200);
    expect(attach.body.profile.avatarAssetId).toBe(assetId);

    // /api/sync surfaces it on the legacy profile row.
    const sync = await agent.get('/api/sync').expect(200);
    const profile = sync.body.tables.profiles.find((p: { id: string }) => p.id === profileId);
    expect(profile.avatarAssetId).toBe(assetId);

    // A later PATCH that doesn't mention avatarAssetId must NOT clear it.
    const unrelated = await agent
      .patch(`/api/profiles/${profileId}`)
      .send({ description: 'unrelated update' })
      .expect(200);
    expect(unrelated.body.profile.avatarAssetId).toBe(assetId);

    // Explicit clear works.
    const cleared = await agent
      .patch(`/api/profiles/${profileId}`)
      .send({ avatarAssetId: null })
      .expect(200);
    expect(cleared.body.profile.avatarAssetId).toBeNull();
  });

  it('PATCH /api/profiles/:id refuses cross-profile updates', async () => {
    const a = await registerAndAuth();
    const b = await registerAndAuth();
    const aProfile = (await a.agent.get('/api/profiles').expect(200)).body.currentProfileId;
    // Profile B tries to PATCH A's profile id.
    const res = await b.agent
      .patch(`/api/profiles/${aProfile}`)
      .send({ data: { image: 'data:image/png;base64,EVIL' } });
    expect(res.status).toBe(404);
  });
});
