import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ensureActiveProfileId } from '../profiles/profiles.service.js';
import {
  createGroupSchema,
  listGroupsQuerySchema,
  updateGroupSchema,
} from './groups.schemas.js';
import * as svc from './groups.service.js';

const router: Router = Router();
router.use(requireAuth);

router.get('/', validate(listGroupsQuerySchema, 'query'), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const groups = await svc.list(profileId, req.query as { status: string; privacy: string });
    res.json({ groups });
  } catch (e) {
    next(e);
  }
});

router.post('/', validate(createGroupSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const group = await svc.create(profileId, req.body);
    res.status(201).json({ group });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const group = await svc.getById(req.params.id!, profileId);
    res.json({ group });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', validate(updateGroupSchema), async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const group = await svc.update(String(req.params.id), profileId, req.body);
    res.json({ group });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const mode = req.query.mode === 'burned' ? 'burned' : 'deleted';
    const group = await svc.softRemove(req.params.id!, profileId, mode);
    res.json({ group });
  } catch (e) {
    next(e);
  }
});

/**
 * Authoritative join: a single atomic mutation, idempotent, replaces the
 * legacy "owner edits memberProfileIds[] and pushes the whole DB" pattern.
 * The session's active profile is the joiner.
 */
router.post('/:id/join', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const group = await svc.join(req.params.id!, profileId);
    res.json({ group });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/leave', async (req, res, next) => {
  try {
    const profileId = await ensureActiveProfileId(req.session.userId!);
    const group = await svc.leave(req.params.id!, profileId);
    res.json({ group });
  } catch (e) {
    next(e);
  }
});

export default router;
