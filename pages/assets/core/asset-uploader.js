/**
 * ESHU_ASSETS — small helper sitting on top of ESHU_API.assets that the
 * legacy page code can lean on to migrate image storage from inline base64
 * data URLs to canonical server-side assets.
 *
 * Why it exists:
 *   The platform used to embed full base64 image payloads inside every
 *   creation / group / profile row that flowed through `/api/sync`. Those
 *   payloads silently dropped on:
 *     - sync push exceeding the JSON body limit,
 *     - the eshu-db compactor stripping `image` once an IndexedDB ref
 *       existed,
 *     - any partial server-side update that didn't re-include them.
 *   The fix is to upload the bytes through the multipart `POST /api/assets`
 *   pipeline, attach the returned asset id to the entity (`imageAssetId`,
 *   `coverAssetId`, `avatarAssetId`), and render via `/api/assets/:id/raw`.
 *
 * This module intentionally stays additive — page code can keep writing the
 * legacy `image` field as a local preview cache, while the asset id
 * becomes the canonical source of truth that survives every reload.
 *
 * Exposed as `window.ESHU_ASSETS`:
 *
 *   uploadDataUrl(dataUrl, filename)
 *     -> Promise<{ assetId, mimeType, byteSize, url } | null>
 *   uploadBlob(blob, filename)
 *     -> Promise<{ assetId, mimeType, byteSize, url } | null>
 *   urlFor(assetId)
 *     -> string | null
 *   resolveImageSrc(entity, { assetField })
 *     -> string | null
 */
(function () {
  'use strict';

  function api() {
    return typeof window !== 'undefined' ? window.ESHU_API : null;
  }

  /** Convert a data URL to a Blob without going through fetch. */
  function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return null;
    const header = dataUrl.slice(5, commaIdx); // strip "data:"
    const payload = dataUrl.slice(commaIdx + 1);
    const isBase64 = /;base64$/i.test(header);
    const mimeType = (isBase64 ? header.replace(/;base64$/i, '') : header) || 'application/octet-stream';
    try {
      let bytes;
      if (isBase64) {
        const binary = atob(payload);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else {
        // URL-encoded plain text payload (rare for images).
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
      return new Blob([bytes], { type: mimeType });
    } catch (err) {
      console.warn('[ESHU_ASSETS] failed to decode data URL:', err);
      return null;
    }
  }

  /** Cache so the same data URL isn't re-uploaded twice in a session. */
  const inflightUploads = new Map(); // dataUrl prefix -> Promise<asset>

  async function uploadBlob(blob, filename) {
    const client = api();
    if (!client || !client.assets) {
      console.warn('[ESHU_ASSETS] ESHU_API.assets unavailable; cannot upload');
      return null;
    }
    if (!(blob instanceof Blob)) return null;
    try {
      const resp = await client.assets.upload(blob, filename || `upload-${Date.now()}.bin`);
      const asset = (resp && resp.asset) || resp;
      if (!asset || !asset.id) {
        console.warn('[ESHU_ASSETS] upload response missing asset id', resp);
        return null;
      }
      return {
        assetId: asset.id,
        mimeType: asset.mimeType || blob.type || null,
        byteSize: typeof asset.byteSize === 'number' ? asset.byteSize : blob.size,
        url: client.assets.rawUrl(asset.id),
      };
    } catch (err) {
      console.warn('[ESHU_ASSETS] uploadBlob failed:', err && err.message || err);
      return null;
    }
  }

  async function uploadDataUrl(dataUrl, filename) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    // Single-flight per session: short-circuit if this exact data URL is
    // already mid-upload (e.g. the user double-clicked Save).
    const cacheKey = dataUrl.length < 256 ? dataUrl : dataUrl.slice(0, 64) + ':' + dataUrl.length;
    if (inflightUploads.has(cacheKey)) return inflightUploads.get(cacheKey);
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return null;
    const guessedExt = (blob.type.split('/')[1] || 'bin').replace('+xml', '');
    const promise = uploadBlob(blob, filename || `image.${guessedExt}`);
    inflightUploads.set(cacheKey, promise);
    promise.finally(() => {
      // Allow re-upload later if the user actually changes the bytes;
      // keep the cache only briefly to dedupe the active save burst.
      setTimeout(() => inflightUploads.delete(cacheKey), 5000);
    });
    return promise;
  }

  function urlFor(assetId) {
    if (!assetId) return null;
    const client = api();
    return client && client.assets ? client.assets.rawUrl(assetId) : null;
  }

  /**
   * Pick the best image src for a row, preferring the canonical server asset
   * when present. Order of precedence:
   *   1. `<assetField>` (e.g. row.imageAssetId / row.coverAssetId / row.avatarAssetId)
   *      → `/api/assets/<id>/raw` (always renders correctly across devices).
   *   2. row.image — legacy inline data URL, used as a preview cache while
   *      the asset upload is in-flight or for rows that pre-date the asset
   *      pipeline.
   *   3. null when nothing is available.
   */
  function resolveImageSrc(entity, opts) {
    if (!entity || typeof entity !== 'object') return null;
    const assetField = (opts && opts.assetField) || 'imageAssetId';
    const assetId = entity[assetField];
    if (typeof assetId === 'string' && assetId.length > 0) {
      const url = urlFor(assetId);
      if (url) return url;
    }
    if (typeof entity.image === 'string' && entity.image.length > 0) {
      return entity.image;
    }
    return null;
  }

  window.ESHU_ASSETS = {
    uploadDataUrl,
    uploadBlob,
    urlFor,
    resolveImageSrc,
    // Exposed for tests / debugging; not part of the stable contract.
    _dataUrlToBlob: dataUrlToBlob,
  };
})();
