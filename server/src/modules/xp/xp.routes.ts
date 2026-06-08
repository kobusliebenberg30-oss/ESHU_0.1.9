import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { awardSchema } from './xp.schemas.js';
import * as svc from './xp.service.js';

const router: Router = Router();
router.use(requireAuth);

/**
 * POST /api/xp/award — award XP for a server-recognized event.
 * Idempotent on (kind, refId). Server owns the rule table; client cannot
 * decide how much XP an action is worth. Returns:
 *   {
 *     xpPoints:       number   // new total after this call
 *     delta:          number   // 0 if already awarded
 *     alreadyAwarded: boolean
 *     unlocks:        string[] // gates open at the new xp total
 *     reason:         string   // human-readable, server-canonical
 *   }
 */
router.post('/award', validate(awardSchema), async (req, res, next) => {
  try {
    const result = await svc.award(req.session.userId!, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/xp/gates — current xp + unlocks for the session's active profile.
 * Lets the frontend ask "what features are unlocked right now?" without
 * recomputing thresholds locally.
 */
router.get('/gates', async (req, res, next) => {
  try {
    const gates = await svc.gates(req.session.userId!);
    res.json(gates);
  } catch (e) {
    next(e);
  }
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /api/xp/history — award history for the session's active profile.
 * Returns rows from the XpAward table, most-recent first.
 */
router.get('/history', validate(historyQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { limit } = req.query as unknown as { limit: number };
    const result = await svc.history(req.session.userId!, limit);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
