/**
 * Refund administration — read-only.
 *
 * See the note on /api/admin/payments: refunds are issued through
 * PaymentService.refundPayment, which is administrator-only and audited. A
 * write endpoint here would be an unaudited second path to the same money.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminPaymentFilterSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const params = request.nextUrl.searchParams;
    const filters = adminPaymentFilterSchema.parse({
      status: params.get('status') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });
    return NextResponse.json({
      success: true,
      data: await AdminService.listRefunds(auth.userId, filters),
    });
  }, request);
}
