import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ReviewService } from '@/services/review.service';
import { reviewCreateSchema } from '@/lib/validations/review.schemas';
import { REVIEW_BLOCK_MESSAGES } from '@/lib/validations/review.schemas';
import { formatErrorResponse } from '@/lib/errors';

function id(request: NextRequest) {
  return request.nextUrl.pathname.split('/').filter(Boolean).at(-2)!;
}

/**
 * Eligibility for reviewing the other party on this contract.
 *
 * Separate from the list endpoint so the UI can render "reviews open" or the
 * specific reason they are closed without a second call that might disagree
 * with this one.
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

    const eligibility = await ReviewService.getEligibility(id(request), user.id);

    return NextResponse.json({
      success: true,
      data: {
        ...eligibility,
        // Ship the reason's message with the reason so the wording lives in one
        // place rather than being re-invented by every client surface.
        message: eligibility.reason
          ? REVIEW_BLOCK_MESSAGES[eligibility.reason]
          : 'You can review the other party on this contract.',
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

/**
 * Leave a review on a completed contract.
 *
 * The body carries the four ratings, optional written feedback and visibility.
 * It carries no reviewee, no reviewer and no contract id: the parties come from
 * the contract and the caller, so there is no field a client can use to credit a
 * review to someone else or aim it at a third party.
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

    const input = reviewCreateSchema.parse(await request.json());
    const review = await ReviewService.createReview(id(request), user.id, input);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: review.id,
          contract_id: review.contract_id,
          reviewee_user_id: review.reviewee_user_id,
          rating_overall: review.rating_overall,
          rating_communication: review.rating_communication,
          rating_quality: review.rating_quality,
          rating_timeliness: review.rating_timeliness,
          created_at: review.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
