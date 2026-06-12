import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ensureActiveProfileId } from '../profiles/profiles.service.js';
import {
  createGameSchema,
  finalizeGameSchema,
  listGamesQuerySchema,
  updateGameSchema,
} from './games.schemas.js';
import * as svc from './games.service.js';

const router: Router = Router();
router.use(requireAuth);

router.get('/', validate(listGamesQuerySchema, 'query'), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const games = await svc.list(profileId, req.query as unknown as { status: string; hostGroupId?: string });
    res.json({ games });
  } catch (e) {
    next(e);
  }
});

router.post('/', validate(createGameSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const game = await svc.create(profileId, req.body);
    res.status(201).json({ game });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ game: await svc.getById(req.params.id!, profileId) });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', validate(updateGameSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ game: await svc.update(String(req.params.id), profileId, req.body) });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/join', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ game: await svc.join(String(req.params.id), profileId) });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/like', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ game: await svc.toggleLike(String(req.params.id), profileId) });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/follow', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ game: await svc.toggleFollow(String(req.params.id), profileId) });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/restore', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ game: await svc.restore(String(req.params.id), profileId) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const m = req.query.mode;
    const mode = m === 'burned' || m === 'finished' ? m : 'deleted';
    res.json({ game: await svc.softRemove(req.params.id!, profileId, mode) });
  } catch (e) {
    next(e);
  }
});

/**
 * Owner-only authoritative finalization. Body: { rankings: [{creationId,
 * voteCount}] }. Server picks top-3 server-side, awards placement XP to
 * creation owners atomically, marks creations with award metadata.
 * Idempotent: a second call returns the existing placements without
 * re-awarding (alreadyFinalized: true in the response).
 */
router.post('/:id/finalize', validate(finalizeGameSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const result = await svc.finalize(String(req.params.id), profileId, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
