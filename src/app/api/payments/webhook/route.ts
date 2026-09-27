import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '@/services/payment.service';
import { getPaymentProvider } from '@/lib/payments/razorpay.provider';

/**
 * Razorpay webhook receiver.
 *
 * Order of operations is deliberate and must not be reordered:
 *
 *   1. Read the body ONCE as raw text. `request.json()` would consume the stream
 *      and destroy the bytes the signature is computed over, so verification
 *      would fail or, worse, be skipped.
 *   2. Verify `x-razorpay-signature` (hex HMAC-SHA256 of the raw body keyed by
 *      the webhook secret). An unverified event is rejected outright.
 *   3. Parse the now-verified text.
 *   4. Claim the event id, which is what makes processing idempotent.
 *
 * Status codes:
 *   400  the signature did not verify, or the envelope carried no genuine
 *        provider event id. Answering anything else would tell a prober whether
 *        the endpoint is live, and would make Razorpay retry a request that can
 *        never succeed.
 *   200  handled, ignored, or already processed. Razorpay stops retrying.
 *   500  the event is valid but could not be applied. The event is recorded as
 *        failed so the retry re-enters processing rather than being skipped.
 *
 * Razorpay applies a ~5 second soft timeout and treats a non-2xx as a delivery
 * failure, retrying on an exponential backoff for 24 hours before disabling the
 * endpoint entirely. Handler work is therefore kept to database writes and, at
 * most, one provider fetch.
 */

// The handler needs the raw body, so the framework must not attempt to buffer or
// transform it first.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 1. Raw body, exactly as sent. Consumed once and reused for both the
  //    signature check and JSON parsing.
  const rawBody = await request.text();

  const signature = request.headers.get('x-razorpay-signature');
  if (!signature) {
    return NextResponse.json(
      { success: false, error: { message: 'Missing signature header.' } },
      { status: 400 }
    );
  }

  // 2. Verify before parsing or acting on anything in the body.
  const provider = getPaymentProvider();
  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    // Log the failure without echoing the body, which is untrusted and may
    // contain another party's PII.
    console.warn('[payments/webhook] signature verification failed', {
      event_id: request.headers.get('x-razorpay-event-id'),
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { success: false, error: { message: 'Invalid signature.' } },
      { status: 400 }
    );
  }

  // 3. Safe to parse now.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Malformed payload.' } },
      { status: 400 }
    );
  }

  const eventType = typeof payload.event === 'string' ? payload.event : '';
  // M-3: the event id must come from Razorpay's own header. Falling back to
  // `payload.event` would substitute the event *type* for the id, so a second
  // distinct event of the same type (e.g. two `payment.captured` deliveries)
  // would collide on the unique (provider, provider_event_id) index, be read
  // back as already processed, answered 200, and silently strand that payment in
  // `pending` forever. A missing id is refused instead.
  const eventId = request.headers.get('x-razorpay-event-id');

  if (!eventType) {
    return NextResponse.json(
      { success: false, error: { message: 'Missing event type.' } },
      { status: 400 }
    );
  }

  if (!eventId || !eventId.trim()) {
    return NextResponse.json(
      { success: false, error: { message: 'Missing provider event id.' } },
      { status: 400 }
    );
  }

  try {
    const result = await PaymentService.handleWebhook({
      eventId,
      eventType,
      payload,
    });

    // Always 2xx once the signature is trusted and the event is recorded.
    // Duplicates and non-actionable events are successful outcomes.
    return NextResponse.json(
      { success: true, data: { received: true, duplicate: result.duplicate } },
      { status: 200 }
    );
  } catch (error) {
    // The event stays on file as 'failed' so Razorpay's retry re-enters
    // processing instead of being discarded as a duplicate.
    console.error('[payments/webhook] processing failed', {
      event_id: eventId,
      event: eventType,
      error: (error as Error)?.message,
    });
    return NextResponse.json(
      { success: false, error: { message: 'Event processing failed.' } },
      { status: 500 }
    );
  }
}

/**
 * Razorpay only uses POST for webhooks. Answering GET with a 405 makes a
 * misconfigured dashboard entry obvious instead of silently never delivering.
 */
export async function GET() {
  return NextResponse.json(
    { success: false, error: { message: 'Method not allowed.' } },
    { status: 405 }
  );
}
