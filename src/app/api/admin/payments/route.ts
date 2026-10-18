/**
 * Payment administration.
 *
 * GET /api/admin/payments          — payments, filterable by status
 * GET /api/admin/payments?failed=1 — the failed-transaction triage view
 *
 * Read-only. Moving money is PaymentService's job, and every mutation there is
 * authorized against the contract parties. Exposing a write here would create a
 * second, differently-authorized path to the same tables, which is precisely how
 * the Stage 10 refund bypass was possible.
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
      contractId: params.get('contractId') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });

    // `failed=1` is a VIEW of the same data, not a separate endpoint, so the
    // triage screen cannot drift from the payment list.
    if (params.get('failed') === '1') {
      const data = await AdminService.listFailedTransactions(auth.userId, filters);
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({
      success: true,
      data: await AdminService.listPayments(auth.userId, filters),
    });
  }, request);
}
