import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, registerAndAuth, truncateAll } from './helpers.js';
import { prisma } from '../db/client.js';

const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
  'base64',
);

/** Force-age an asset so the GC's grace window doesn't shield it. */
const ageAsset = async (id: string, ms = 2 * 60 * 60 * 1000) =>
  prisma.asset.update({
    where: { id },
    data: { createdAt: new Date(Date.now() - ms) },
  });

describe('asset GC', () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('reaps an orphaned asset older than the grace window', async () => {
    const { agent } = await registerAndAuth();
    const upload = await agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const assetId: string = upload.body.asset.id;

    await ageAsset(assetId);

    const gc = await agent.post('/api/assets/gc').send({}).expect(200);
    expect(gc.body.rowsDeleted).toBe(1);
    expect(gc.body.blobsDeleted).toBe(1);
    expect(gc.body.bytesReclaimed).toBe(PNG_PIXEL.byteLength);
    expect(gc.body.ids).toEqual([assetId]);

    // Row is gone.
    expect(await prisma.asset.findUnique({ where: { id: assetId } })).toBeNull();
  });

  it('refuses to reap an asset still referenced by a Profile.avatarAssetId', async () => {
    const { agent, user } = await registerAndAuth();
    const upload = await agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201);
    const assetId: string = upload.body.asset.id;

    // Trigger lazy profile provisioning — Profile rows are created on first
    // authenticated touch of any /api/profiles, /api/sync, etc. endpoint.
    await agent.get('/api/profiles').expect(200);
    const profile = await prisma.profile.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.profile.update({
      where: { id: profile.id },
      data: { avatarAssetId: assetId },
    });

    await ageAsset(assetId);

    const gc = await agent.post('/api/assets/gc').send({}).expect(200);
    expect(gc.body.rowsDeleted).toBe(0);
    expect(gc.body.ids).toEqual([]);
    expect(await prisma.asset.findUnique({ where: { id: assetId } })).not.toBeNull();
  });

  it('protects orphaned assets younger than the grace window', async () => {
    const { agent } = await registerAndAuth();
    const upload = await agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'fresh.png', contentType: 'image/png' })
      .expect(201);
    const assetId: string = upload.body.asset.id;
    // Do NOT age — should be inside the default 1h grace window.

    const gc = await agent.post('/api/assets/gc').send({}).expect(200);
    expect(gc.body.rowsDeleted).toBe(0);
    expect(gc.body.ids).toEqual([]);
    expect(await prisma.asset.findUnique({ where: { id: assetId } })).not.toBeNull();
  });

  it('dryRun reports candidates without deleting', async () => {
    const { agent } = await registerAndAuth();
    const upload = await agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const assetId: string = upload.body.asset.id;
    await ageAsset(assetId);

    const dry = await agent.post('/api/assets/gc').send({ dryRun: true }).expect(200);
    expect(dry.body.rowsDeleted).toBe(0);
    expect(dry.body.ids).toEqual([assetId]);
    // Row still present.
    expect(await prisma.asset.findUnique({ where: { id: assetId } })).not.toBeNull();
  });

  it('does not touch other users\' orphans', async () => {
    const a = await registerAndAuth();
    const b = await registerAndAuth();

    // User B uploads two slightly different blobs (different bytes → different sha).
    const upA = await a.agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const upB = await b.agent
      .post('/api/assets')
      .attach('file', Buffer.concat([PNG_PIXEL, Buffer.from([0])]), {
        filename: 'b.png',
        contentType: 'image/png',
      })
      .expect(201);

    await ageAsset(upA.body.asset.id);
    await ageAsset(upB.body.asset.id);

    // User A runs GC — only their own orphan is reaped.
    const gc = await a.agent.post('/api/assets/gc').send({}).expect(200);
    expect(gc.body.ids).toEqual([upA.body.asset.id]);
    expect(await prisma.asset.findUnique({ where: { id: upB.body.asset.id } })).not.toBeNull();
  });

  it('any authenticated user can read an asset attached to a Creation; orphaned assets stay owner-only', async () => {
    // Author uploads an asset and attaches it to a creation.
    const author = await registerAndAuth();
    const authorProfile = await prisma.profile.findFirstOrThrow({ where: { userId: author.user.id } });

    const attachedUpload = await author.agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'attached.png', contentType: 'image/png' })
      .expect(201);
    const attachedAssetId: string = attachedUpload.body.asset.id;

    await prisma.creation.create({
      data: {
        id: 'cre_versus_visible',
        name: 'For versus',
        ownerProfileId: authorProfile.id,
        imageAssetId: attachedAssetId,
        timestamp: BigInt(Date.now()),
      },
    });

    // Author also uploads a *different* asset and leaves it orphaned.
    const orphanUpload = await author.agent
      .post('/api/assets')
      .attach('file', Buffer.concat([PNG_PIXEL, Buffer.from([1])]), { filename: 'orphan.png', contentType: 'image/png' })
      .expect(201);
    const orphanAssetId: string = orphanUpload.body.asset.id;

    // Another user shows up. They must be able to fetch the attached asset
    // (SU / versus mechanic depends on this) but NOT the orphan.
    const viewer = await registerAndAuth();
    const attachedView = await viewer.agent.get(`/api/assets/${attachedAssetId}`).expect(200);
    expect(attachedView.body.asset.id).toBe(attachedAssetId);

    const attachedRaw = await viewer.agent.get(`/api/assets/${attachedAssetId}/raw`).expect(200);
    expect(attachedRaw.headers['content-type']).toBe('image/png');
    expect(attachedRaw.headers['content-length']).toBe(String(PNG_PIXEL.byteLength));

    const orphanView = await viewer.agent.get(`/api/assets/${orphanAssetId}`);
    expect(orphanView.status).toBe(403);
    const orphanRaw = await viewer.agent.get(`/api/assets/${orphanAssetId}/raw`);
    expect(orphanRaw.status).toBe(403);

    // Owner can still read their own orphan.
    const ownerOrphan = await author.agent.get(`/api/assets/${orphanAssetId}`).expect(200);
    expect(ownerOrphan.body.asset.id).toBe(orphanAssetId);
  });

  it('GC route requires authentication', async () => {
    const { getApp } = await import('./helpers.js');
    const request = (await import('supertest')).default;
    await request(getApp()).post('/api/assets/gc').send({}).expect(401);
  });

  // Regression — pre-fix the (sha256) UNIQUE constraint blew up with P2002
  // the moment a second user tried to upload bytes the first user had
  // already saved. That meant a single shared default avatar / re-uploaded
  // creation made the whole asset pipeline 500 for everyone after.
  it('lets two users upload identical bytes without colliding', async () => {
    const a = await registerAndAuth();
    const b = await registerAndAuth();

    const upA = await a.agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'shared.png', contentType: 'image/png' })
      .expect(201);
    const upB = await b.agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'shared.png', contentType: 'image/png' })
      .expect(201);

    expect(upA.body.asset.id).not.toBe(upB.body.asset.id);
    expect(upA.body.asset.ownerId).not.toBe(upB.body.asset.ownerId);
    // Same hash, same dedup'd storage key — only the metadata row diverges.
    expect(upA.body.asset.sha256).toBe(upB.body.asset.sha256);
    expect(upA.body.asset.storageKey).toBe(upB.body.asset.storageKey);

    // Re-uploading the same bytes as the same user must still dedup to the
    // existing row (no duplicate metadata).
    const upADup = await a.agent
      .post('/api/assets')
      .attach('file', PNG_PIXEL, { filename: 'shared.png', contentType: 'image/png' })
      .expect(201);
    expect(upADup.body.asset.id).toBe(upA.body.asset.id);
  });
});
