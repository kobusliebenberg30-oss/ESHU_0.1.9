(function () {
  'use strict';

  const IMAGE_STORE = {
    DB_NAME: 'eshu_media_store_v1',
    STORE_NAME: 'creation_images',
    VERSION: 1
  };

  const state = {
    dbPromise: null,
    objectUrlById: new Map()
  };

  function openDb() {
    if (!('indexedDB' in window)) {
      return Promise.reject(new Error('IndexedDB is unavailable'));
    }

    if (state.dbPromise) return state.dbPromise;

    state.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(IMAGE_STORE.DB_NAME, IMAGE_STORE.VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE.STORE_NAME)) {
          db.createObjectStore(IMAGE_STORE.STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open media store'));
    });

    return state.dbPromise;
  }

  async function getImageRecordById(id) {
    if (!id) return null;
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE.STORE_NAME, 'readonly');
      const store = tx.objectStore(IMAGE_STORE.STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Failed to read image record'));
    });
  }

  async function resolveCreationImageSrc(creation) {
    if (!creation || typeof creation !== 'object') return null;

    // Prefer server-side asset when present (post-migration). Auth cookies
    // travel automatically because the URL is on the same /api host.
    if (creation.imageAssetId && window.ESHU_API && typeof window.ESHU_API.assets?.rawUrl === 'function') {
      return window.ESHU_API.assets.rawUrl(creation.imageAssetId);
    }

    const imageRef = creation.imageRef;
    const refId = imageRef && imageRef.storage === 'indexeddb' ? imageRef.id : null;

    if (!refId) {
      return creation.image || null;
    }

    if (state.objectUrlById.has(refId)) {
      return state.objectUrlById.get(refId);
    }

    try {
      const record = await getImageRecordById(refId);
      if (!record || !record.blob) {
        return creation.image || null;
      }

      const objectUrl = URL.createObjectURL(record.blob);
      state.objectUrlById.set(refId, objectUrl);
      return objectUrl;
    } catch (err) {
      console.warn('Failed to resolve indexed image, falling back to inline preview:', err);
      return creation.image || null;
    }
  }

  /**
   * Fetch the raw Blob for an IndexedDB image id. Returns null if missing or
   * IndexedDB is unavailable. Used by the image-migrator to upload to the
   * server.
   */
  async function getImageBlob(id) {
    if (!id) return null;
    try {
      const record = await getImageRecordById(id);
      return record && record.blob instanceof Blob ? record.blob : null;
    } catch (err) {
      console.warn('Failed to read indexed image blob:', id, err);
      return null;
    }
  }

  async function hydrateCreationImages(container, creations) {
    if (!container) return;

    const byId = Array.isArray(creations)
      ? new Map(creations.filter(Boolean).map(c => [c.id, c]))
      : creations instanceof Map
        ? creations
        : new Map();

    const targets = container.querySelectorAll('[data-creation-image-target][data-creation-id]');

    for (const imgEl of targets) {
      const creationId = imgEl.dataset.creationId;
      if (!creationId) continue;
      const creation = byId.get(creationId);
      if (!creation) continue;

      const src = await resolveCreationImageSrc(creation);
      if (!src) continue;

      imgEl.src = src;
      imgEl.style.display = 'block';
      const parent = imgEl.parentElement;
      if (parent) {
        parent.querySelectorAll('[data-image-fallback]').forEach(fallback => {
          fallback.style.display = 'none';
        });
      }
    }
  }

  function revokeAllObjectUrls() {
    state.objectUrlById.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch {
      }
    });
    state.objectUrlById.clear();
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') return reject(new Error('Unexpected blob reader result'));
        resolve(result);
      };
      reader.onerror = () => reject(reader.error || new Error('Could not read blob'));
      reader.readAsDataURL(blob);
    });
  }

  async function base64ToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  async function exportAllImages() {
    if (!('indexedDB' in window)) return [];
    let db;
    try {
      db = await openDb();
    } catch {
      return [];
    }

    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE.STORE_NAME, 'readonly');
      const store = tx.objectStore(IMAGE_STORE.STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error('Failed to read image records'));
    });

    const out = [];
    for (const record of records) {
      if (!record || !record.id) continue;
      try {
        const blob = record.blob;
        if (!(blob instanceof Blob)) continue;
        const dataUrl = await blobToBase64(blob);
        out.push({
          id: record.id,
          type: blob.type || 'application/octet-stream',
          dataUrl
        });
      } catch (err) {
        console.warn('Failed to serialize image for export:', record.id, err);
      }
    }
    return out;
  }

  async function importImages(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    if (!('indexedDB' in window)) return 0;

    const db = await openDb();
    let written = 0;

    for (const entry of entries) {
      if (!entry || !entry.id || !entry.dataUrl) continue;
      try {
        const blob = await base64ToBlob(entry.dataUrl);
        await new Promise((resolve, reject) => {
          const tx = db.transaction(IMAGE_STORE.STORE_NAME, 'readwrite');
          const store = tx.objectStore(IMAGE_STORE.STORE_NAME);
          const req = store.put({ id: entry.id, blob });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error || new Error('Failed to write image record'));
        });
        written += 1;
      } catch (err) {
        console.warn('Failed to import image record:', entry.id, err);
      }
    }

    revokeAllObjectUrls();
    return written;
  }

  async function clearAllImages() {
    if (!('indexedDB' in window)) return;
    let db;
    try {
      db = await openDb();
    } catch {
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE.STORE_NAME, 'readwrite');
      const store = tx.objectStore(IMAGE_STORE.STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to clear image records'));
    });
    revokeAllObjectUrls();
  }

  window.addEventListener('beforeunload', revokeAllObjectUrls);

  window.ESHU_MEDIA = {
    resolveCreationImageSrc,
    hydrateCreationImages,
    revokeAllObjectUrls,
    exportAllImages,
    importImages,
    clearAllImages,
    getImageBlob
  };
})();
