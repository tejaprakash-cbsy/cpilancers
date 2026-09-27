/**
 * Job administration.
 *
 * GET  /api/admin/jobs        — search jobs, filterable by moderation state
 * GET  /api/admin/jobs/[id]   — one job in full
 * PATCH /api/admin/jobs/[id]  — flag, unflag or remove
 *
 * "Remove" is a soft state, not a delete. A job with proposals, or with a
 * contract, is referenced with ON DELETE RESTRICT, and the history behind a
 * dispute may still be needed. See AdminService.moderateJob.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminJobSearchSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const params = request.nextUrl.searchParams;
    const filters = adminJobSearchSchema.parse({
      query: params.get('query') ?? undefined,
      status: params.get('status') ?? undefined,
      moderationStatus: params.get('moderationStatus') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });
    return NextResponse.json({
      success: true,
      data: await AdminService.searchJobs(auth.userId, filters),
    });
  });
}
