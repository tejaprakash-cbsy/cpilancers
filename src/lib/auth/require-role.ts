import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { roleHomePath } from '@/lib/auth/role-redirects';
import type { UserRole } from '@/types/database';

/**
 * F-03 — route-level role guard (defense in depth).
 *
 * This is ADditive. It stops a page intended for one role from being rendered
 * for another, but it is NOT an authorization boundary: every API route and
 * service method still performs its own check, and those remain the real
 * enforcement layer. Nothing here weakens or replaces them.
 *
 * The role is read from `public.users.role` via `AuthService.getCurrentUser()`,
 * which derives the user id from the verified session cookie and then reads the
 * role from the database. It is deliberately NOT read from user metadata, a
 * query parameter, a request header, localStorage or the cookie itself, all of
 * which are client-controlled and therefore forgeable.
 *
 * ## Why this is a layout and not `proxy.ts`
 *
 * `DESIGN_NOTES.md` §7 records a deliberate decision that role is enforced in
 * the service layer and not in the proxy, because "enforcing role in the proxy
 * would trust a value the proxy itself does not verify". A server layout gets
 * the role from the same verified, database-backed source as the services, so it
 * does not have that problem. The proxy is left exactly as it was.
 */
export async function requireRole(allowed: readonly UserRole[]): Promise<UserRole> {
  const user = await AuthService.getCurrentUser();

  // Unauthenticated. The proxy already redirects most protected paths, but a
  // layout guard must not depend on a regex someone may later edit, and this
  // also preserves the existing `/login` destination.
  if (!user) {
    redirect('/login');
  }

  const role = user.role as UserRole;

  if (!allowed.includes(role)) {
    // Redirect to this user's OWN home, never to the page they were denied, so
    // a wrong-role visit cannot bounce between two pages. See `loopSafety` in
    // the F-03 report for the per-role analysis.
    redirect(roleHomePath(role));
  }

  return role;
}

/**
 * The roles allowed on client-only surfaces.
 *
 * `admin` is included deliberately. `ROLE_HOME_PATH` documents the admin home as
 * `/dashboard/client` (there is no admin dashboard page yet), so excluding admin
 * from the client dashboard would redirect an admin to a page they are not
 * allowed to see -- an infinite redirect loop. This preserves the existing,
 * documented admin behaviour rather than inventing a new one.
 */
export const CLIENT_ROLES: readonly UserRole[] = ['client', 'admin'];

/** The roles allowed on consultant-only surfaces. */
export const CONSULTANT_ROLES: readonly UserRole[] = ['consultant'];