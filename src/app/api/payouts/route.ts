import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { PaymentService } from '@/services/payment.service';
import { payoutFilterSchema } from '@/lib/validations/payment.schemas';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Consultant payout tracking.
 *
 * A consultant sees only their own payouts, resolved from their authenticated
 * profile rather than from a query parameter, so there is no identifier to
 * tamper with.
 *
 * `processing` here means the escrow hold has been released and the transfer is
 * queued under Razorpay's settlement schedule. It does not mean the money is in
 * the bank; only `completed` does.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }
    if (user.role !== 'consultant') {
      return NextResponse.json(
        { success: false, error: { message: 'Consultants only.', code: 'FORBIDDEN' } },
        { status: 403 }
      );
    }

    const params = request.nextUrl.searchParams;
    const parsed = payoutFilterSchema.parse({
      status: params.get('status')
        ? params.get('status')!.split(',').filter(Boolean)
        : undefined,
    });

    const payouts = await PaymentService.listPayouts(user.id, { status: parsed.status });

    return NextResponse.json({
      success: true,
      data: {
        payouts,
        totals: {
          count: payouts.length,
          net_amount_cents: payouts
            .filter((p) => p.status !== 'failed')
            .reduce((sum, p) => sum + p.amount_cents, 0),
          completed_amount_cents: payouts
            .filter((p) => p.status === 'completed')
            .reduce((sum, p) => sum + p.amount_cents, 0),
        },
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
