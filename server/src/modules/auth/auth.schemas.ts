import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(254),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'username may contain letters, digits, _ . -'),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
});

export const loginSchema = z.object({
  emailOrUsername: z.string().min(3).max(254),
  password: z.string().min(1).max(128),
  // When `false`, the route emits a browser-session cookie (no maxAge) so
  // the session ends when the browser closes. When `true` or omitted, the
  // configured 30-day rolling cookie is used. Omitted ≠ false to preserve
  // back-compat with clients that don't yet send this flag.
  rememberMe: z.boolean().optional(),
});

export const supabaseSessionSchema = z.object({
  accessToken: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const deleteAccountSchema = z.object({
  // Required even though we already have a session — guards against a
  // malicious tab / session-fixation vector deleting a user's account.
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SupabaseSessionInput = z.infer<typeof supabaseSessionSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
