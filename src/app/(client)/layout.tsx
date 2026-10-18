import { requireRole, CLIENT_ROLES } from '@/lib/auth/require-role';

/**
 * F-03 role guard for client-only surfaces.
 *
 * Covers everything in this route group: `/jobs/create`, `/jobs/[id]/edit` and
 * `/jobs/[id]/proposals` — the pages that match the API rules in
 * `POST /api/jobs` ("Only clients can create jobs") and
 * `GET /api/jobs/[id]/proposals`.
 *
 * The check lives here, in a server component, so it runs before any of the
 * group's client components are rendered or fetch anything. The APIs below it
 * still enforce the same rule independently.
 */
export const dynamic = 'force-dynamic';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requireRole(CLIENT_ROLES);
  return <>{children}</>;
}