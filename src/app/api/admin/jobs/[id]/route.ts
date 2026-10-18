/**
 * One job, and a moderation decision about it.
 *
 * GET   /api/admin/jobs/[id]  — the job in full
 * PATCH /api/admin/jobs/[id]  — flag, unflag, remove or restore
 *
 * The body is `.strict()`: it accepts a moderation state and a reason, and
 * rejects anything else, so a client cannot smuggle a job's `status` (its
 * marketplace state) or a price through the moderation endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminJobModerationSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, parseAdminResourceId, requireAdminUser } from '@/lib/admin/route-helpers';

function targetId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const data = await AdminService.getJobDetail(auth.userId, parseAdminResourceId(targetId(request)));
    return NextResponse.json({ success: true, data });
  }, request);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const input = adminJobModerationSchema.parse(await request.json());
    const data = await AdminService.moderateJob(auth.userId, parseAdminResourceId(targetId(request)), input, auth.audit);
    return NextResponse.json({ success: true, data });
  }, request);
}
