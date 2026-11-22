import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { PaymentService } from '@/services/payment.service';
import { paymentReleaseSchema } from '@/lib/validations/payment.schemas';
import { formatErrorResponse, PaymentsUnavailableError } from '@/lib/errors';
import { getPaymentProvider } from '@/lib/payments/razorpay.provider';

function id(request: NextRequest) {
  return request.nextUrl.pathname.split('/').filter(Boolean).at(-2)!;
}

/**
 * Release escrowed funds to the consultant.
 *
 * Client-only, and refused unless the milestone has been approved. The request
 * body carries no amount: the transfer value is the net figure frozen on the
 * ledger row at creation.
 */
export async function POST(request: NextRequest) {
  try {
    getPaymentProvider();
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const raw = await request.json().catch(() => ({}));
    const input = paymentReleaseSchema.parse(raw ?? {});

    const payment = await PaymentService.releaseToConsultant(
      id(request),
      user.id,
      input.note
    );

    return NextResponse.json({
      success: true,
      data: {
        payment_id: payment.id,
        status: payment.status,
        escrow_released_at: payment.escrow_released_at,
      },
    });
  } catch (error) {
    if (error instanceof PaymentsUnavailableError) {
      return NextResponse.json(
        { error: { code: 'PAYMENTS_UNAVAILABLE', message: 'Payments are not available yet.' } },
        { status: 503 }
      );
    }
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
