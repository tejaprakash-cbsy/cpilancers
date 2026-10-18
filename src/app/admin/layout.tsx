import { requireRole } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['admin']);
  return <>{children}</>;
}
