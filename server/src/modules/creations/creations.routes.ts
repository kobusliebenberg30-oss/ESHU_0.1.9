import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ensureActiveProfileId } from '../profiles/profiles.service.js';
import {
  createCreationSchema,
  listCreationsQuerySchema,
  updateCreationSchema,
} from './creations.schemas.js';
import * as svc from './creations.service.js';

const router: Router = Router();
router.use(requireAuth);

router.get('/', validate(listCreationsQuerySchema, 'query'), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const creations = await svc.list(profileId, req.query as unknown as { status: string; hostGameId?: string });
    res.json({ creations });
  } catch (e) {
    next(e);
  }
});

router.post('/', validate(createCreationSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.status(201).json({ creation: await svc.create(profileId, req.body) });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ creation: await svc.getById(req.params.id!, profileId) });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', validate(updateCreationSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ creation: await svc.update(String(req.params.id), profileId, req.body) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const mode = req.query.mode === 'burned' ? 'burned' : 'deleted';
    res.json({ creation: await svc.softRemove(req.params.id!, profileId, mode) });
  } catch (e) {
    next(e);
  }
});

export default router;
