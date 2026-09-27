/**
 * GET /api/admin/overview — the marketplace summary.
 *
 * Authorization is enforced inside AdminService against the caller's database
 * row. A non-administrator receives 403 whether or not any marketplace data
 * exists, so this endpoint cannot be used to confirm that a deployment is live.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const overview = await AdminService.getOverview(auth.userId, auth.audit);
    return NextResponse.json({ success: true, data: overview });
  });
}
