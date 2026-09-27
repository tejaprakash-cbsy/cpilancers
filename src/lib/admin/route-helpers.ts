/**
 * Shared helpers for every `/api/admin/*` route.
 *
 * The authorization decision lives here, once, so that no route can forget it.
 * A route that resolves its own caller is a route that will eventually resolve it
 * differently from its neighbour; a route that calls `requireAdminUser` cannot.
 *
 * Two rules this file exists to enforce:
 *
 *   1. The administrator's identity comes from the SESSION, never from the
 *      request. No route reads an administrator id, a role or an email from a
 *      body, a query parameter or a header. Routes pass `sessionUser.id` and
 *      nothing else, and `AdminService.requireAdmin` re-reads the role from the
 *      database, so a stale or forged token cannot widen it.
 *
 *   2. A missing session is 401 and a non-administrator is 403. Conflating them
 *      would tell an unauthenticated prober which accounts exist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse } from '@/lib/errors';
import type { AuditContext } from '@/services/admin.service';

/**
 * Resolve the authenticated caller, or return the response that should be sent.
 *
 * A route uses it as an early return:
 *
 *   const auth = await requireAdminUser(request);
 *   if ('response' in auth) return auth.response;
 *   // auth.userId and auth.audit are now available
 */
export async function requireAdminUser(
  request: NextRequest
): Promise<
  { userId: string; audit: AuditContext } | { response: NextResponse }
> {
  const sessionUser = await AuthService.getCurrentUser();
  if (!sessionUser) {
    return {
      response: NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      ),
    };
  }

  // The role check itself is performed inside AdminService, against the database,
  // on every call. This layer only establishes *who* is calling.
  return {
    userId: sessionUser.id,
    audit: readAuditContext(request),
  };
}

/**
 * Extract the coarse request context stored on an audit entry.
 *
 * `x-forwarded-for` is taken only as the first hop and is truncated, because it
 * is caller-influenced text that would otherwise be stored verbatim. A value
 * that is merely plausible for correlation is the right trade here; an
 * unbounded string from a request header is not something to persist.
 */
export function readAuditContext(request: NextRequest): AuditContext {
  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded
    ? forwarded.split(',')[0]?.trim().slice(0, 64) ?? null
    : request.headers.get('x-real-ip')?.slice(0, 64) ?? null;
  const userAgent = request.headers.get('user-agent')?.slice(0, 256) ?? null;
  return { ipAddress, userAgent };
}

/**
 * Wrap a handler so an unexpected error still produces a JSON error response
 * rather than an HTML stack trace from the framework.
 */
export function adminRoute(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  return handler().catch((error: unknown) => {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  });
}
