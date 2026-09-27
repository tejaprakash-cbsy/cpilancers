/**
 * Payout administration — read-only, consultant-facing state.
 *
 * A payout is what the consultant is owed and what has actually settled, so the
 * settlement id and failure reason are both included: a payout that has not
 * settled is exactly the thing an operator needs to see.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminPayoutFilterSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const params = request.nextUrl.searchParams;
    const filters = adminPayoutFilterSchema.parse({
      status: params.get('status') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });
    return NextResponse.json({
      success: true,
      data: await AdminService.listPayouts(auth.userId, filters),
    });
  });
}
