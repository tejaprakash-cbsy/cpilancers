import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { PaymentService } from '@/services/payment.service';
import { formatErrorResponse, PaymentsUnavailableError } from '@/lib/errors';
import { getPaymentProvider } from '@/lib/payments/razorpay.provider';

function id(request: NextRequest) {
  return request.nextUrl.pathname.split('/').filter(Boolean).pop()!;
}

/**
 * Payment status, including the escrow and payout detail a participant needs to
 * render the funding panel.
 *
 * Status is always read from the ledger, never echoed from the browser. The
 * ledger is only advanced by a verified provider fetch or webhook, so this
 * endpoint cannot be made to report a payment as funded by forging a request.
 */
export async function GET(request: NextRequest) {
  try {
    getPaymentProvider();
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const paymentId = id(request);
    const payment = await PaymentService.getPayment(paymentId, user.id);
    const refunds = await PaymentService.listRefunds(paymentId, user.id);

    return NextResponse.json({
      success: true,
      data: {
        payment,
        refunds,
        // A client-visible breakdown. The gross is what the payer owes; the fee
        // and net are disclosed so the split is never a surprise to either party.
        breakdown: {
          gross_amount_cents: payment.gross_amount_cents,
          platform_fee_cents: payment.platform_fee_cents,
          net_amount_cents: payment.net_amount_cents,
          currency: payment.currency,
        },
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
