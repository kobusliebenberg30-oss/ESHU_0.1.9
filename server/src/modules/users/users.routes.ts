import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/error.js';

const router: Router = Router();

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId! },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarAssetId: true,
        createdAt: true,
      },
    });
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

router.get('/:username', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, username: true, displayName: true, bio: true, avatarAssetId: true, createdAt: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

export default router;
