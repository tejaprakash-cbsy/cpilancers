import { requireRole, CLIENT_ROLES } from '@/lib/auth/require-role';

/**
 * F-03 role guard for the client dashboard.
 *
 * This page sits outside the `(client)` route group, so it needs its own guard.
 * `admin` is allowed because `ROLE_HOME_PATH` documents `/dashboard/client` as
 * the admin home page; blocking them here would loop.
 */
export const dynamic = 'force-dynamic';

export default async function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireRole(CLIENT_ROLES);
  return <>{children}</>;
}