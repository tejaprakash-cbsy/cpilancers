/**
 * One user, and a status change to that user.
 *
 * GET   /api/admin/users/[id]  — the user with their profile records
 * PATCH /api/admin/users/[id]  — suspend, unsuspend or ban
 *
 * The body carries a status and a reason and nothing else. In particular there
 * is no way to supply the acting administrator: `auth.userId` comes from the
 * session, and the schema is `.strict()` so an attempt to include `admin_user_id`
 * or `role` in the body is rejected rather than ignored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminUserModerationSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, parseAdminResourceId, requireAdminUser } from '@/lib/admin/route-helpers';

function targetId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const data = await AdminService.getUserDetail(auth.userId, parseAdminResourceId(targetId(request)));
    return NextResponse.json({ success: true, data });
  }, request);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const input = adminUserModerationSchema.parse(await request.json());
    const data = await AdminService.moderateUser(auth.userId, parseAdminResourceId(targetId(request)), input, auth.audit);
    return NextResponse.json({ success: true, data });
  }, request);
}
