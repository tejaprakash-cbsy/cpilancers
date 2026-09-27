import { NextRequest, NextResponse } from 'next/server';
import { ReviewService } from '@/services/review.service';
import { reviewFilterSchema } from '@/lib/validations/review.schemas';
import { distributionPercentages } from '@/lib/reviews/reputation';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Public reviews left about a user.
 *
 * Read-only and unauthenticated by design: reputation has to be visible to
 * prospective counterparties before they sign up, or it cannot influence
 * discovery. Only live, public reviews are returned; a soft-deleted review is
 * invisible here exactly as it is to the aggregate.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const query = reviewFilterSchema.parse({
      reviewee_user_id: params.get('reviewee_user_id') ?? undefined,
      min_rating: params.get('min_rating')
        ? Number(params.get('min_rating'))
        : undefined,
      sortBy: params.get('sortBy') ?? undefined,
      sortOrder: params.get('sortOrder') ?? undefined,
      page: params.get('page') ? Number(params.get('page')) : undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    });

    if (!query.reviewee_user_id) {
      return NextResponse.json(
        {
          success: false,
          error: { message: 'A reviewee_user_id is required.', code: 'VALIDATION_ERROR' },
        },
        { status: 400 }
      );
    }

    const { reviews, total } = await ReviewService.listReviews(query.reviewee_user_id, {
      ...(query.min_rating !== undefined ? { min_rating: query.min_rating } : {}),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    });

    const summary = await ReviewService.getReputation(query.reviewee_user_id);

    return NextResponse.json({
      success: true,
      data: {
        reviews,
        pagination: {
          total,
          page: query.page,
          limit: query.limit,
          pages: Math.max(1, Math.ceil(total / query.limit)),
        },
        // The display model travels with the list so a profile page renders the
        // average, the count, the distribution and the completed-project total
        // from one response and cannot show them inconsistently.
        summary: {
          ...summary,
          rating_percentages: distributionPercentages(summary.rating_distribution),
        },
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
