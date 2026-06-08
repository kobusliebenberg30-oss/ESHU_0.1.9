import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../db/client.js';
import { ensureActiveProfileId } from '../profiles/profiles.service.js';

const router: Router = Router();
router.use(requireAuth);

const updateSchema = z.object({
  uiTheme: z.enum(['light', 'dark']).optional(),
  primaryGroupId: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const canonicalProfileId = await ensureActiveProfileId(userId);
    const setting = await prisma.userSetting.upsert({
      where: { userId },
      create: { userId, currentProfileId: canonicalProfileId },
      update: { currentProfileId: canonicalProfileId },
    });
    res.json({ setting });
  } catch (e) {
    next(e);
  }
});

router.put('/', validate(updateSchema), async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const canonicalProfileId = await ensureActiveProfileId(userId);
    const data: Record<string, unknown> = {};
    if (req.body.uiTheme !== undefined) data.uiTheme = req.body.uiTheme;
    if (req.body.primaryGroupId !== undefined) data.primaryGroupId = req.body.primaryGroupId;
    if (req.body.data !== undefined) data.data = req.body.data;
    const setting = await prisma.userSetting.upsert({
      where: { userId },
      create: { userId, currentProfileId: canonicalProfileId, ...data },
      update: { ...data, currentProfileId: canonicalProfileId },
    });
    res.json({ setting });
  } catch (e) {
    next(e);
  }
});

export default router;
