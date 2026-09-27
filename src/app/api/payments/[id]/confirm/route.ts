import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { PaymentService } from '@/services/payment.service';
import { formatErrorResponse } from '@/lib/errors';

function id(request: NextRequest) {
  return request.nextUrl.pathname.split('/').filter(Boolean).at(-2)!;
}

/**
 * Confirm a payment and open escrow.
 *
 * This endpoint takes no body and no amount. It asks Razorpay what actually
 * happened and compares the captured amount against the gross recorded when the
 * payment was created. A payment is only ever reported as escrowed on the
 * strength of that server-side comparison, never on the strength of anything the
 * browser asserts.
 *
 * Calling it when the payment is already escrowed is a no-op rather than an
 * error, which keeps a double-click or a retried request harmless.
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

    const payment = await PaymentService.confirmPayment(id(request), user.id);

    return NextResponse.json({
      success: true,
      data: {
        payment_id: payment.id,
        status: payment.status,
        escrow_funded_at: payment.escrow_funded_at,
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
