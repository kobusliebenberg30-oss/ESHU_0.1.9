import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error.js';
import * as svc from './profiles.service.js';

const router: Router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(2000).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional(),
  xpPoints: z.number().int().min(0).optional(),
  // Reference to an Asset uploaded via POST /api/assets. Sending `null`
  // clears the avatar; omitting the field leaves it unchanged.
  avatarAssetId: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
});

const playerbaseQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

const setActiveSchema = z.object({ profileId: z.string() });

router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    // Idempotent first-touch provisioning: guarantees the legacy frontend
    // always sees a valid `currentProfileId` from the very first request,
    // matching the behaviour of `/api/sync` and the granular endpoints.
    const currentProfileId = await svc.ensureActiveProfileId(userId);
    const profiles = await svc.listProfiles(userId);
    res.json({ profiles, currentProfileId });
  } catch (e) {
    next(e);
  }
});

router.get('/playerbase', validate(playerbaseQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { limit } = req.query as unknown as { limit: number };
    const profiles = await svc.listPlayerbase(limit);
    res.json({ profiles });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/public-content', async (req, res, next) => {
  try {
    const content = await svc.getPublicProfileContent(String(req.params.id));
    if (!content) throw new HttpError(404, 'Profile not found');
    res.json(content);
  } catch (e) {
    next(e);
  }
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const profile = await svc.createProfile(req.session.userId!, req.body);
    res.status(201).json({ profile });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const profile = await svc.updateProfile(req.session.userId!, String(req.params.id), req.body);
    if (!profile) throw new HttpError(404, 'Profile not found');
    res.json({ profile });
  } catch (e) {
    next(e);
  }
});

router.post('/active', validate(setActiveSchema), async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const canonicalProfileId = await svc.ensureActiveProfileId(userId);
    if (req.body.profileId !== canonicalProfileId) {
      throw new HttpError(409, 'Only one player profile is allowed per account');
    }
    res.json({ currentProfileId: canonicalProfileId });
  } catch (e) {
    next(e);
  }
});

export default router;
