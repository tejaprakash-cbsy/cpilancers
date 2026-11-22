import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { PaymentService } from '@/services/payment.service';
import { z } from 'zod';
import { formatErrorResponse, PaymentsUnavailableError } from '@/lib/errors';
import { getPaymentProvider } from '@/lib/payments/razorpay.provider';

function id(request: NextRequest) {
  return request.nextUrl.pathname.split('/').filter(Boolean).at(-2)!;
}

const attachSchema = z
  .object({
    razorpay_payment_id: z.string().min(1).max(64),
  })
  .strict();

/**
 * Bind the provider payment id to a ledger row once Checkout completes.
 *
 * The id arrives from the browser and is therefore treated as a claim, not a
 * fact: the service fetches the payment from Razorpay and rejects it unless it
 * belongs to the order this ledger row created and its amount matches the gross
 * frozen at creation.
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

    const input = attachSchema.parse(await request.json());
    const payment = await PaymentService.attachProviderPayment(
      id(request),
      user.id,
      input.razorpay_payment_id
    );

    return NextResponse.json({
      success: true,
      data: { payment_id: payment.id, status: payment.status },
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
