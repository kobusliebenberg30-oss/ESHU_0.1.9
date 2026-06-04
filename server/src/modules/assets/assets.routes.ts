import { Router } from 'express';
import multer from 'multer';
import { env } from '../../env.js';
import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/error.js';
import { storage } from '../../storage/index.js';
import { gcOrphanedAssets, getAssetForUser, uploadAsset } from './assets.service.js';

const router: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.STORAGE_MAX_BYTES, files: 1 },
});

/**
 * POST /api/assets/gc
 * Reap the authenticated user's orphaned assets (uploaded but never attached
 * to a profile avatar, group cover, creation image, or auth-level avatar).
 * Accepts `{ dryRun?: boolean }` to count without deleting.
 *
 * Always scoped to the caller — there's no admin path here. Ops-wide GC is
 * available via `scripts/gc-assets.mjs`.
 */
router.post('/gc', requireAuth, async (req, res, next) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const result = await gcOrphanedAssets({
      ownerId: req.session.userId!,
      dryRun,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'file field required');
    const asset = await uploadAsset({
      ownerId: req.session.userId!,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });
    res.status(201).json({ asset });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const asset = await getAssetForUser(String(req.params.id), req.session.userId);
    res.json({ asset });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/raw', requireAuth, async (req, res, next) => {
  try {
    const asset = await getAssetForUser(String(req.params.id), req.session.userId);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Length', String(asset.byteSize));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    const stream = await storage().get(asset.storageKey);
    stream.on('error', next);
    stream.pipe(res);
  } catch (e) {
    next(e);
  }
});

export default router;
