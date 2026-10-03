import { requireRole, CONSULTANT_ROLES } from '@/lib/auth/require-role';

/**
 * F-03 role guard for consultant-only surfaces.
 *
 * Covers `/proposals` and `/proposals/new/[jobId]` in this route group. That is
 * the consultant's own proposal list and the form used to submit one, which is
 * exactly what `GET /api/proposals` and `POST /api/proposals` already restrict:
 * "Only consultants can access this endpoint. Clients use /api/jobs/[id]/proposals
 * instead."
 *
 * Note the route group, not the URL, decides this. `(consultant)` is a pathless
 * group, so these pages are served at `/proposals/...` despite living under a
 * consultant-named folder.
 */
export default async function ConsultantLayout({ children }: { children: React.ReactNode }) {
  await requireRole(CONSULTANT_ROLES);
  return <>{children}</>;
}