import { prisma } from '../../db/client.js';
import { hashPassword, verifyPassword } from '../../lib/hash.js';
import { HttpError } from '../../middleware/error.js';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  LoginInput,
  RegisterInput,
} from './auth.schemas.js';

export const registerUser = async (input: RegisterInput) => {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, 'Email or username already in use');

  const passwordHash = await hashPassword(input.password);
  const profileName = input.displayName ?? input.username;
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash,
        displayName: profileName,
      },
      select: { id: true, email: true, username: true, displayName: true, createdAt: true },
    });
    const profile = await tx.profile.create({
      data: {
        userId: user.id,
        name: profileName,
      },
      select: { id: true },
    });
    await tx.userSetting.create({
      data: {
        userId: user.id,
        currentProfileId: profile.id,
      },
    });
    return user;
  });
  return result;
};

function slugifyUsername(value: string): string {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .slice(0, 32);
  return base || 'player';
}

async function uniqueUsername(seed: string): Promise<string> {
  const base = slugifyUsername(seed);
  let attempt = base.slice(0, 32);
  let suffix = 0;

  while (true) {
    const existing = await prisma.user.findUnique({
      where: { username: attempt },
      select: { id: true },
    });
    if (!existing) return attempt;
    suffix += 1;
    const suffixText = '_' + suffix;
    attempt = (base.slice(0, Math.max(1, 32 - suffixText.length)) + suffixText).slice(0, 32);
  }
}

function deriveSupabaseDisplayName(user: SupabaseUser): string {
  const meta = user.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata as Record<string, unknown>
    : {};
  const candidates = [meta.display_name, meta.full_name, meta.name, meta.username, user.email];
  const picked = candidates.find((value) => typeof value === 'string' && value.trim());
  return String(picked || 'Player').trim().slice(0, 64) || 'Player';
}

function deriveSupabaseUsername(user: SupabaseUser): string {
  const meta = user.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata as Record<string, unknown>
    : {};
  const raw = [meta.username, user.email ? user.email.split('@')[0] : '', user.id.slice(0, 12)]
    .find((value) => typeof value === 'string' && value.trim());
  return slugifyUsername(String(raw || 'player'));
}

function buildSupabaseShadowPassword(user: SupabaseUser): string {
  return `sb::${user.id}::${user.email ?? 'no-email'}`;
}

export const syncSupabaseUser = async (supabaseUser: SupabaseUser) => {
  const email = String(supabaseUser.email || '').trim().toLowerCase();
  if (!email) throw new HttpError(400, 'Supabase account is missing an email address');

  const displayName = deriveSupabaseDisplayName(supabaseUser);
  const shadowPasswordHash = await hashPassword(buildSupabaseShadowPassword(supabaseUser));
  const byEmail = await prisma.user.findUnique({ where: { email } });

  if (byEmail) {
    const updated = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        displayName: byEmail.displayName || displayName,
        lastLoginAt: new Date(),
      },
      select: { id: true, email: true, username: true, displayName: true },
    });
    return updated;
  }

  const username = await uniqueUsername(deriveSupabaseUsername(supabaseUser));
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        username,
        passwordHash: shadowPasswordHash,
        displayName,
        lastLoginAt: new Date(),
      },
      select: { id: true, email: true, username: true, displayName: true, createdAt: true },
    });
    const profile = await tx.profile.create({
      data: {
        userId: user.id,
        name: displayName || username,
      },
      select: { id: true },
    });
    await tx.userSetting.create({
      data: {
        userId: user.id,
        currentProfileId: profile.id,
      },
    });
    return user;
  });
  return result;
};

export const authenticate = async (input: LoginInput) => {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.emailOrUsername.toLowerCase() }, { username: input.emailOrUsername }],
    },
  });
  if (!user) throw new HttpError(401, 'Invalid credentials');

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, username: user.username, displayName: user.displayName };
};

/**
 * Verify the current password and replace the stored hash. Caller (the
 * route) is responsible for regenerating the session id afterwards to defeat
 * session-fixation attacks tied to the previous credential.
 *
 * Both `currentPassword` mismatch and `userId` not found surface as 401 so a
 * stale session can't probe for valid user ids.
 */
export const changePassword = async (
  userId: string,
  input: ChangePasswordInput,
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, 'Invalid credentials');

  const ok = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  if (input.currentPassword === input.newPassword) {
    throw new HttpError(400, 'New password must differ from the current password');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
};

/**
 * Permanently delete the user and everything cascading from it (sessions,
 * profiles, asset rows, user-setting). Group/Game/Creation rows the user
 * owned via Profile.ownerProfileId are kept (FK is SetNull); orphaned blobs
 * are reclaimed on the next asset-GC sweep.
 */
export const deleteUser = async (
  userId: string,
  input: DeleteAccountInput,
): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, 'Invalid credentials');

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  await prisma.user.delete({ where: { id: userId } });
};
