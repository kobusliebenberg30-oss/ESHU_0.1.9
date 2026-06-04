import { Router } from 'express';
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

export default router;
