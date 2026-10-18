/**
 * A single report, and the decision made about it.
 *
 * GET   /api/admin/reports/[id]  — the report
 * PATCH /api/admin/reports/[id]  — action_taken or dismissed, with a reason
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminReportUpdateSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, parseAdminResourceId, requireAdminUser } from '@/lib/admin/route-helpers';

function targetId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const data = await AdminService.getReportDetail(auth.userId, parseAdminResourceId(targetId(request)));
    return NextResponse.json({ success: true, data });
  }, request);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const input = adminReportUpdateSchema.parse(await request.json());
    const data = await AdminService.updateReport(auth.userId, parseAdminResourceId(targetId(request)), input, auth.audit);
    return NextResponse.json({ success: true, data });
  }, request);
}
