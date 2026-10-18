import { requireRole, CONSULTANT_ROLES } from '@/lib/auth/require-role';

/**
 * F-03 role guard for the consultant dashboard.
 *
 * A denied visitor is sent to their own home via `roleHomePath`, never back to
 * the page they were denied, so the redirect cannot bounce.
 *
 * Note on the HTTP status: a `redirect()` thrown from a server layout is
 * signalled by Next.js as a 200 carrying a `NEXT_REDIRECT` payload that the
 * client then follows, not as a bare 307. The security property that matters is
 * that the denied page's content is never rendered -- verified in the F-03
 * report.
 */
export const dynamic = 'force-dynamic';

export default async function ConsultantDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireRole(CONSULTANT_ROLES);
  return <>{children}</>;
}