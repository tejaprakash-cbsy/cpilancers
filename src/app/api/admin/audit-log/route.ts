/**
 * The administrative audit log — read-only.
 *
 * There is no PATCH or DELETE handler, and that is the point. The table has an
 * append-only trigger in the database, no grants for any browser role, and no
 * write method in AdminService, so an entry can be read and nothing else. The
 * absence of a mutation route is the authorization.
 *
 * Reads are not themselves audit entries: listing the log is what an
 * administrator does when reviewing, and recording every read would bury the
 * moderation actions the log exists to surface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminAuditFilterSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const params = request.nextUrl.searchParams;
    const filters = adminAuditFilterSchema.parse({
      category: params.get('category') ?? undefined,
      adminUserId: params.get('adminUserId') ?? undefined,
      targetType: params.get('targetType') ?? undefined,
      targetId: params.get('targetId') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });
    return NextResponse.json({
      success: true,
      data: await AdminService.listAuditLog(auth.userId, filters),
    });
  });
}
