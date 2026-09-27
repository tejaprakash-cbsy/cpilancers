import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { PaymentService } from '@/services/payment.service';
import { paymentRefundSchema, REFUND_FORBIDDEN_MESSAGE } from '@/lib/validations/payment.schemas';
import { formatErrorResponse } from '@/lib/errors';

function id(request: NextRequest) {
  return request.nextUrl.pathname.split('/').filter(Boolean).at(-2)!;
}

/**
 * Refund a captured payment. ADMINISTRATOR ONLY.
 *
 * A refund is a unilateral reversal of a disbursement, so it is not available to
 * either contract participant. The paying client cannot reverse their own
 * escrow, and the paid consultant cannot refund a payment in order to receive
 * the money back. Neither is an administrator, so both are refused here and
 * again inside `PaymentService.refundPayment`, which re-reads the role from
 * `public.users` rather than trusting the session shape.
 *
 * The role gate here is defence in depth, not the control itself: the service
 * check is the authoritative one, and it runs before the payment is loaded so
 * this endpoint cannot be used to probe which payment ids exist.
 *
 * The refundable ceiling is the captured amount, checked server-side, and a
 * transfer reversal is issued automatically when escrow was already released.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }
    if (user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: { message: REFUND_FORBIDDEN_MESSAGE, code: 'FORBIDDEN' } },
        { status: 403 }
      );
    }

    const input = paymentRefundSchema.parse(await request.json());
    const { payment, refund } = await PaymentService.refundPayment(id(request), user.id, {
      ...(input.amount_cents !== undefined ? { amount_cents: input.amount_cents } : {}),
      reason: input.reason,
      speed: input.speed,
    });

    return NextResponse.json({
      success: true,
      data: {
        payment_id: payment.id,
        status: payment.status,
        refund: {
          id: refund.id,
          amount_cents: refund.amount_cents,
          status: refund.status,
          speed: refund.speed,
        },
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
