import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { PaymentService } from '@/services/payment.service';
import { createAdminClient } from '@/lib/supabase/admin';
import { connectOnboardingSchema } from '@/lib/validations/payment.schemas';
import { formatErrorResponse, AppError } from '@/lib/errors';

/**
 * Consultant payout onboarding (Razorpay Route linked account).
 *
 * Re-running onboarding after the account already exists returns the existing
 * id rather than creating a second linked account, so a double-submit cannot
 * orphan a KYC-pending account.
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
    if (user.role !== 'consultant') {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'Only consultants can onboard for payouts.', code: 'FORBIDDEN' },
        },
        { status: 403 }
      );
    }

    const input = connectOnboardingSchema.parse(await request.json());

    // Razorpay requires a business email on the linked account. The consultant's
    // own account email is the authoritative value; it is never taken from the
    // request body.
    //
    // M-1: this previously also read `profiles.email`, but public.profiles has
    // no such column (id, user_id, first_name, last_name, display_name,
    // avatar_url, timezone, country_code, city, bio_summary, created_at,
    // updated_at). That select therefore always failed with 42703 and the
    // error was silently swallowed by `maybeSingle()`, leaving the fallback
    // branch permanently dead. The account email lives on public.users, which
    // is the single authoritative source, so only that is read here and its
    // error is no longer discarded.
    const db = createAdminClient();
    const { data: userRow, error: userError } = await db
      .from('users')
      .select('email')
      .eq('id', user.id)
      .single();
    if (userError || !userRow) {
      throw new AppError(
        'Could not resolve the account email required for payout onboarding.',
        500,
        'ONBOARDING_EMAIL_LOOKUP_FAILED',
        userError
      );
    }
    const businessEmail = userRow.email;
    if (!businessEmail) {
      return NextResponse.json(
        { success: false, error: { message: 'No email address is on file for this account.' } },
        { status: 422 }
      );
    }

    const accountId = await PaymentService.createLinkedAccount(user.id, {
      email: businessEmail,
      phone: input.phone,
      legalBusinessName: input.legal_business_name,
      contactName: input.contact_name,
      businessType: input.business_type,
      category: input.category,
      subcategory: input.subcategory,
      address: {
        street1: input.address.street1,
        street2: input.address.street2,
        city: input.address.city,
        state: input.address.state,
        postalCode: input.address.postal_code,
        country: input.address.country,
      },
      referenceId: user.id,
      ...(input.pan ? { pan: input.pan } : {}),
      ...(input.gst ? { gst: input.gst } : {}),
    });

    return NextResponse.json(
      { success: true, data: { razorpay_account_id: accountId } },
      { status: 201 }
    );
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

/**
 * Current onboarding and payout status.
 *
 * Razorpay is the authority on `payouts_enabled`; the service mirrors its answer
 * into the consultant profile because the funding path checks that flag before
 * creating an escrow transfer.
 */
export async function GET() {
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

    return NextResponse.json({ success: true, data: await PaymentService.getConnectStatus(user.id) });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
