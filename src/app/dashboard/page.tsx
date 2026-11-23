import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { roleHomePath } from '@/lib/auth/role-redirects';

export const dynamic = 'force-dynamic';

/**
 * Root dashboard redirect.
 *
 * Ensures /dashboard routes visitors to their own role-specific dashboard
 * (/dashboard/client, /dashboard/consultant, or /admin) rather than 404ing.
 */
export default async function DashboardRootPage() {
  const user = await AuthService.getCurrentUser();
  if (!user) {
    redirect('/login?next=/dashboard');
  }
  redirect(roleHomePath(user.role));
}
