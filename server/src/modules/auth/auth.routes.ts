import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { env } from '../../env.js';
import { prisma } from '../../db/client.js';
import { getSupabasePublicConfig, getSupabaseUser, isSupabaseEnabled } from '../../lib/supabase.js';
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  registerSchema,
  supabaseSessionSchema,
} from './auth.schemas.js';
import {
  authenticate,
  changePassword,
  deleteUser,
  registerUser,
  syncSupabaseUser,
} from './auth.service.js';

const router: Router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // The integration suite drives many register/login/change-password calls
  // from a single IP. Bypass the limiter under NODE_ENV=test so the suite
  // can grow without bumping into the per-IP cap.
  skip: () => process.env.NODE_ENV === 'test',
});

function applyRememberMe(session: unknown, rememberMe: boolean | undefined) {
  if (rememberMe === false) {
    const cookie = (session as { cookie?: unknown } | null)?.cookie as { maxAge: number | null } | undefined;
    if (cookie) cookie.maxAge = null;
  }
}

router.get('/supabase/config', (_req, res) => {
  res.json(getSupabasePublicConfig());
});

router.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const user = await registerUser(req.body);
    req.session.userId = user.id;
    res.status(201).json({ user });
  } catch (e) {
    next(e);
  }
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const user = await authenticate(req.body);
    req.session.userId = user.id;
    applyRememberMe(req.session, req.body.rememberMe);

    res.json({ user });
  } catch (e) {
    next(e);
  }
});

router.post('/supabase/session', authLimiter, validate(supabaseSessionSchema), async (req, res, next) => {
  try {
    if (!isSupabaseEnabled()) {
      res.status(503).json({ error: 'Supabase auth is not configured' });
      return;
    }
    const supabaseUser = await getSupabaseUser(req.body.accessToken);
    const user = await syncSupabaseUser(supabaseUser);
    req.session.userId = user.id;
    applyRememberMe(req.session, req.body.rememberMe);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(env.SESSION_COOKIE_NAME);
    res.status(204).end();
  });
});

/**
 * POST /api/auth/change-password
 * Verify currentPassword, replace the stored hash, and regenerate the
 * session id to defeat session-fixation attacks tied to the previous
 * credential. Other devices' sessions remain valid (their cookies still
 * map to live PgStore rows); a future iteration could nuke `prisma.session`
 * rows for the user to log out everywhere.
 */
router.post(
  '/change-password',
  authLimiter,
  requireAuth,
  validate(changePasswordSchema),
  async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      await changePassword(userId, req.body);

      // Atomic regenerate-and-restore the userId. Express-session's
      // regenerate() callback API is the only way to swap the underlying
      // session id while keeping the response handler intact.
      req.session.regenerate((regenErr) => {
        if (regenErr) return next(regenErr);
        req.session.userId = userId;
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          res.status(204).end();
        });
      });
    } catch (e) {
      next(e);
    }
  },
);

/**
 * DELETE /api/auth/account
 * Verify the user's current password (defence in depth — the live session
 * cookie alone shouldn't be enough to nuke an account) and delete the User
 * row. Cascades clear sessions, profiles, asset rows, and user-setting.
 * Groups/Games/Creations the user owned have their `ownerProfileId` set
 * to null and are reaped lazily by future cleanup logic.
 */
router.delete(
  '/account',
  authLimiter,
  requireAuth,
  validate(deleteAccountSchema),
  async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      await deleteUser(userId, req.body);

      req.session.destroy((destroyErr) => {
        if (destroyErr) return next(destroyErr);
        res.clearCookie(env.SESSION_COOKIE_NAME);
        res.status(204).end();
      });
    } catch (e) {
      next(e);
    }
  },
);

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId! },
      select: { id: true, email: true, username: true, displayName: true, avatarAssetId: true },
    });
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

export default router;
