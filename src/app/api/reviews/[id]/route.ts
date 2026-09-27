import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '@/services/auth.service';
import { ReviewService } from '@/services/review.service';
import {
  reviewDeleteSchema,
  reviewUpdateSchema,
} from '@/lib/validations/review.schemas';
import { formatErrorResponse, ValidationError } from '@/lib/errors';

/**
 * The review id is the LEAF segment of this route, so it is the last non-empty
 * path component: `/api/reviews/<id>` -> `['api', 'reviews', '<id>']`.
 *
 * `.at(-2)` is only correct when a literal segment follows the dynamic one
 * (`/api/contracts/<id>/review`), and using it here previously resolved to the
 * literal string "reviews", so every PATCH and DELETE returned 404. `.pop()`
 * matches the convention used by the other leaf-id routes in this codebase
 * (`milestones/[id]`, `payments/[id]`, `jobs/[id]`, `contracts/[id]`).
 */
const reviewIdSchema = z.string().uuid('Invalid review ID');

function id(request: NextRequest): string {
  const segment = request.nextUrl.pathname.split('/').filter(Boolean).pop();
  const parsed = reviewIdSchema.safeParse(segment);
  if (!parsed.success) throw new ValidationError('Invalid review ID.');
  return parsed.data;
}

/**
 * Amend a review.
 *
 * Author-only, within the seven-day edit window, and every change is written to
 * `review_edits` with a complete before/after snapshot. The contract and the two
 * parties are not in the accepted body at all, and the database trigger rejects
 * any attempt to change them regardless.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const input = reviewUpdateSchema.parse(await request.json());
    const review = await ReviewService.updateReview(id(request), user.id, input);

    return NextResponse.json({
      success: true,
      data: {
        id: review.id,
        rating_overall: review.rating_overall,
        rating_communication: review.rating_communication,
        rating_quality: review.rating_quality,
        rating_timeliness: review.rating_timeliness,
        feedback_markdown: review.feedback_markdown,
        is_public: review.is_public,
        edit_count: review.edit_count,
        edited_at: review.edited_at,
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

/**
 * Delete a review.
 *
 * The author may withdraw their own review inside the edit window. An
 * administrator may remove any review at any time, and a reason is mandatory in
 * both cases so the `review_edits` trail always records why a rating vanished
 * from a public profile.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const input = reviewDeleteSchema.parse(await request.json());
    const { review } = await ReviewService.deleteReview(
      id(request),
      user.id,
      user.role === 'admin',
      input.reason
    );

    return NextResponse.json({
      success: true,
      data: { id: review.id, deleted_at: review.deleted_at },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
