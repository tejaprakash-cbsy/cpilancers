/**
 * Role-based post-authentication routing.
 *
 * The role lives in `public.users.role` (enum `user_role`:
 * 'client' | 'consultant' | 'admin') and is read through the existing
 * `AuthService`. This module is deliberately pure and free of React and
 * Supabase imports so both the API route and the client form resolve the
 * destination from one single source of truth, and so the mapping can be
 * regression-tested directly.
 */

import type { UserRole } from '@/types/database';

/**
 * Where each role lands after signing in.
 *
 * Administrators have a dedicated server-guarded dashboard.
 */
export const ROLE_HOME_PATH: Record<UserRole, string> = {
  client: '/dashboard/client',
  consultant: '/dashboard/consultant',
  admin: '/admin',
};

/** The destination used when the role is missing or unrecognised. */
export const DEFAULT_HOME_PATH = '/dashboard/client';

/**
 * Resolve a role to its home path. Unknown or absent roles fall back to
 * {@link DEFAULT_HOME_PATH} rather than throwing, so a role added to the
 * database enum before this map is updated cannot break sign-in.
 */
export function roleHomePath(role: UserRole | null | undefined): string {
  if (!role) return DEFAULT_HOME_PATH;
  return ROLE_HOME_PATH[role] ?? DEFAULT_HOME_PATH;
}

/**
 * A `?next=` value is only honoured when it is a same-origin relative path.
 *
 * Rejects `//evil.com` and `https://evil.com` so a crafted link cannot turn the
 * login form into an open redirect, and rejects control characters that could be
 * used to smuggle a second header.
 */
export function isSafeNextPath(raw: string | null | undefined): boolean {
  if (!raw) return false;
  if (raw.startsWith('//')) return false;
  if (!raw.startsWith('/')) return false;
  if (raw.includes('\\')) return false;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return false;
  return true;
}

/**
 * Pick where to send a user straight after a successful sign-in.
 *
 * A safe `?next=` wins so a deep link the user was originally bounced from is
 * preserved. Otherwise the destination comes from their actual role -- never
 * from a hardcoded path that would drop consultants into the client dashboard.
 */
export function resolvePostLoginPath(
  role: UserRole | null | undefined,
  next?: string | null
): string {
  if (isSafeNextPath(next)) return next as string;
  return roleHomePath(role);
}
