/**
 * User administration.
 *
 * GET  /api/admin/users           — search users
 * GET  /api/admin/users/[id]      — one user with their profile records
 * PATCH /api/admin/users/[id]     — suspend, unsuspend or ban
 *
 * The target id comes from the URL and is the SUBJECT of the action. The
 * administrator performing it always comes from the session, and the service
 * refuses self-moderation, so the two can never be confused.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminUserSearchSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const params = request.nextUrl.searchParams;
    const filters = adminUserSearchSchema.parse({
      query: params.get('query') ?? undefined,
      role: params.get('role') ?? undefined,
      status: params.get('status') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });
    return NextResponse.json({
      success: true,
      data: await AdminService.searchUsers(auth.userId, filters),
    });
  });
}
