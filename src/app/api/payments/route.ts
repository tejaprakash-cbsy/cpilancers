import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { PaymentService } from '@/services/payment.service';
import {
  paymentCreateSchema,
  paymentFilterSchema,
  FORBIDDEN_PAYMENT_INPUT_KEYS,
} from '@/lib/validations/payment.schemas';
import { formatErrorResponse, ValidationError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const params = request.nextUrl.searchParams;
    const parsed = paymentFilterSchema.parse({
      contract_id: params.get('contract_id') ?? undefined,
      status: params.get('status')
        ? params.get('status')!.split(',').filter(Boolean)
        : undefined,
    });

    return NextResponse.json({
      success: true,
      data: await PaymentService.listPayments(user.id, {
        contract_id: parsed.contract_id,
        status: parsed.status,
      }),
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

/**
 * Open a payment for a milestone.
 *
 * The request body carries a milestone id and nothing else. Any attempt to
 * supply an amount, fee, currency or counterparty is rejected outright rather
 * than stripped, because a client that is sending those values is either
 * confused or hostile and both deserve a loud failure instead of a silent one.
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
    if (user.role !== 'client') {
      return NextResponse.json(
        { success: false, error: { message: 'Only clients can fund milestones.', code: 'FORBIDDEN' } },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const smuggled = FORBIDDEN_PAYMENT_INPUT_KEYS.filter((key) => key in body);
    if (smuggled.length > 0) {
      throw new ValidationError(
        'Payment amounts, fees and counterparties are determined by the server and cannot be supplied.'
      );
    }

    const input = paymentCreateSchema.parse(body);
    const result = await PaymentService.createPayment(user.id, input.milestone_id);

    return NextResponse.json(
      {
        success: true,
        data: {
          payment_id: result.payment.id,
          status: result.payment.status,
          // The browser needs the order id and the public key to open Razorpay
          // Checkout. The key secret is never present in this response.
          razorpay_order_id: result.razorpay_order_id,
          razorpay_key_id: result.razorpay_key_id,
          amount_cents: result.amount_cents,
          currency: result.currency,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
