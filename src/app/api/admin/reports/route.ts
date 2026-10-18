/**
 * Report administration — the queue behind the "reported users / jobs / messages
 * / reviews" views.
 *
 * GET  /api/admin/reports          — list, filterable by target type
 * PATCH /api/admin/reports/[id]    — mark investigating, acted on, or dismissed
 *
 * The body is `.strict()` and carries no reporter or admin id. A report cannot
 * be closed without a stated action, and the entry that records that action is
 * linked back onto the report row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminReportFilterSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const params = request.nextUrl.searchParams;
    const filters = adminReportFilterSchema.parse({
      targetType: params.get('targetType') ?? undefined,
      status: params.get('status') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });
    return NextResponse.json({
      success: true,
      data: await AdminService.listReports(auth.userId, filters),
    });
  }, request);
}
