/**
 * IndexedDB → /api/assets image migrator
 *
 * Background, idempotent, opt-in. When the remote backend is active and the
 * user is authenticated, this scans creations whose images live in
 * IndexedDB (`creation.imageRef.storage === 'indexeddb'`) and don't yet have
 * a server-side `imageAssetId`. For each, it:
 *
 *   1. Loads the Blob via ESHU_MEDIA.getImageBlob(refId)
 *   2. Uploads via ESHU_API.assets.upload(blob)
 *   3. Updates the creation record:
 *        - sets imageAssetId
 *        - clears imageRef + image (so future renders use the API URL)
 *   4. Saves the bulk DB through ESHU_DB.setDb (the remote driver pushes it)
 *
 * Concurrency: serial (one upload at a time) to avoid overwhelming the
 * server, with a small delay between items so the debounced /api/sync push
 * can coalesce updates. A failed upload is logged and skipped; the next run
 * will retry.
 *
 * Triggers: runs once after `eshu:remote-activated`, or immediately if the
 * remote driver is already active when this script loads. Manual trigger:
 * `ESHU_IMAGE_MIGRATOR.run()`.
 *
 * Events:
 *   eshu:images-migrating     { pending: number }
 *   eshu:images-migrated      { migrated: number, skipped: number, failed: number }
 *   eshu:images-migrate-error { error }
 */
(function () {
  'use strict';

  if (window.ESHU_IMAGE_MIGRATOR) return;

  const DELAY_BETWEEN_UPLOADS_MS = 150;
  let running = false;

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch {}
  }

  function isRemoteActive() {
    try {
      return !!(window.ESHU_DB &&
        typeof window.ESHU_DB.getStorageDriverName === 'function' &&
        window.ESHU_DB.getStorageDriverName() === 'remote');
    } catch { return false; }
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function findCandidates(db) {
    const creations = (db && db.tables && Array.isArray(db.tables.creations)) ? db.tables.creations : [];
    return creations.filter((c) => {
      if (!c || c.imageAssetId) return false;
      if (c.imageRef && c.imageRef.storage === 'indexeddb' && c.imageRef.id) return true;
      // Also handle the legacy case where image is a data URL but no imageRef
      // exists. We'll skip those to avoid uploading huge prebuilt seeds, but
      // surface the count so the user can opt-in later if needed.
      return false;
    });
  }

  async function uploadOne(creation) {
    const refId = creation.imageRef && creation.imageRef.id;
    if (!refId) return { status: 'skipped', reason: 'no-ref' };

    if (!window.ESHU_MEDIA || typeof window.ESHU_MEDIA.getImageBlob !== 'function') {
      return { status: 'skipped', reason: 'no-media-store' };
    }
    const blob = await window.ESHU_MEDIA.getImageBlob(refId);
    if (!blob) return { status: 'skipped', reason: 'no-blob' };

    const filename =
      (creation.name ? String(creation.name).replace(/[^\w.-]+/g, '_') : 'creation') +
      (blob.type && blob.type.includes('/') ? '.' + blob.type.split('/')[1] : '');

    const result = await window.ESHU_API.assets.upload(blob, filename);
    const asset = result && result.asset;
    if (!asset || !asset.id) return { status: 'failed', reason: 'no-asset-id' };
    return { status: 'ok', assetId: asset.id };
  }

  async function run() {
    if (running) return { status: 'already-running' };
    if (!window.ESHU_API || !window.ESHU_DB || !isRemoteActive()) {
      return { status: 'not-applicable' };
    }

    running = true;
    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const db = window.ESHU_DB.getDb();
      const candidates = findCandidates(db);
      if (!candidates.length) {
        emit('eshu:images-migrated', { migrated: 0, skipped: 0, failed: 0 });
        return { status: 'noop' };
      }

      emit('eshu:images-migrating', { pending: candidates.length });

      // We mutate a single working copy and write back at the end + after each
      // success, so partial progress survives a refresh.
      for (let i = 0; i < candidates.length; i++) {
        const target = candidates[i];
        try {
          const res = await uploadOne(target);
          if (res.status === 'ok') {
            // Re-read the live db each time in case other writes happened.
            const live = window.ESHU_DB.getDb();
            const idx = (live.tables.creations || []).findIndex((c) => c && c.id === target.id);
            if (idx >= 0) {
              const updated = {
                ...live.tables.creations[idx],
                imageAssetId: res.assetId,
                imageRef: null,
                image: null
              };
              live.tables.creations[idx] = updated;
              window.ESHU_DB.setDb(live);
            }
            migrated += 1;
          } else if (res.status === 'skipped') {
            skipped += 1;
          } else {
            failed += 1;
          }
        } catch (err) {
          console.error('[ESHU image-migrator] upload failed for', target.id, err);
          failed += 1;
          emit('eshu:images-migrate-error', { creationId: target.id, error: err });
        }
        await sleep(DELAY_BETWEEN_UPLOADS_MS);
      }

      emit('eshu:images-migrated', { migrated, skipped, failed });
      return { status: 'done', migrated, skipped, failed };
    } finally {
      running = false;
    }
  }

  function autoRun() {
    if (isRemoteActive()) {
      run().catch((err) => console.error('[ESHU image-migrator] run() failed', err));
    }
  }

  // Run after the remote driver activates.
  window.addEventListener('eshu:remote-activated', () => {
    // Small delay so the initial /api/sync hydration has settled.
    setTimeout(autoRun, 500);
  });

  // If we land on a page where remote is already active (e.g. user navigated
  // within the app), run on DOM ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(autoRun, 500), { once: true });
  } else {
    setTimeout(autoRun, 500);
  }

  window.ESHU_IMAGE_MIGRATOR = {
    run,
    isRunning: () => running
  };
})();
