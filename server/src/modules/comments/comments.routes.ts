import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ensureActiveProfileId } from '../profiles/profiles.service.js';
import {
  createCommentSchema,
  listCommentsQuerySchema,
  updateCommentSchema,
} from './comments.schemas.js';
import * as svc from './comments.service.js';

const router: Router = Router();
router.use(requireAuth);

/**
 * GET /api/comments?targetKind=&targetId=&status=
 *
 * The list endpoint is parameterised by parent target rather than per-user
 * scope. Comments on a creation/game/group are visible to anyone who can
 * see the parent — at this layer we simply require auth. Visibility of the
 * PARENT row is enforced by the parent's own list/get endpoints.
 */
router.get('/', validate(listCommentsQuerySchema, 'query'), async (req, res, next) => {
  try {
    const filters = req.query as unknown as Parameters<typeof svc.list>[0];
    res.json({ comments: await svc.list(filters) });
  } catch (e) {
    next(e);
  }
});

router.post('/', validate(createCommentSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.status(201).json({ comment: await svc.create(profileId, req.body) });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json({ comment: await svc.getById(req.params.id!) });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', validate(updateCommentSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ comment: await svc.update(String(req.params.id), profileId, req.body) });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/comments/:id/like — server-side toggle so two devices can't
 * race on read-modify-write of the likedBy array.
 */
router.post('/:id/like', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ comment: await svc.toggleLike(req.params.id!, profileId) });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/follow', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    res.json({ comment: await svc.toggleFollow(req.params.id!, profileId) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const mode = req.query.mode === 'burned' ? 'burned' : 'deleted';
    res.json({ comment: await svc.softRemove(req.params.id!, profileId, mode) });
  } catch (e) {
    next(e);
  }
});

export default router;
