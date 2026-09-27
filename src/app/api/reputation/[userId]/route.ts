import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ReviewService } from '@/services/review.service';
import { distributionPercentages } from '@/lib/reviews/reputation';
import { formatErrorResponse, ValidationError } from '@/lib/errors';

/**
 * The user id is the LEAF segment of this route, so it is the last non-empty
 * path component: `/api/reputation/<userId>` -> `['api', 'reputation', '<userId>']`.
 *
 * `.at(-2)` is only correct when a literal segment follows the dynamic one. It
 * was used here previously and resolved to the literal string "reputation",
 * which was then handed to PostgREST as a uuid, failed to parse, and — because
 * the service did not check the error — produced an HTTP 200 with an all-zero
 * reputation summary for every caller. `.pop()` matches the leaf-id convention
 * used elsewhere in this codebase.
 *
 * The uuid guard closes the other half of that failure mode: a malformed id is
 * now a 400, never a silent zero.
 */
const userIdSchema = z.string().uuid('Invalid user ID');

function id(request: NextRequest): string {
  const segment = request.nextUrl.pathname.split('/').filter(Boolean).pop();
  const parsed = userIdSchema.safeParse(segment);
  if (!parsed.success) throw new ValidationError('Invalid user ID.');
  return parsed.data;
}

/**
 * The reputation display model for a user: average rating, review count, rating
 * distribution and completed projects.
 *
 * Unauthenticated on purpose. A prospective client deciding whether to hire a
 * consultant needs this before creating an account, and a prospective
 * consultant needs it to judge the clients they might work for.
 *
 * `ranking_score` is included because discovery will need it, but it is the
 * Bayesian ordering aid and not a rating any reviewer gave. A client rendering
 * this must display `average_rating` and `total_reviews`, never
 * `ranking_score`, as if it were a score out of five.
 */
export async function GET(request: NextRequest) {
  try {
    const summary = await ReviewService.getReputation(id(request));

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        rating_percentages: distributionPercentages(summary.rating_distribution),
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
