/**
 * Reputation math.
 *
 * Pure functions, no database access, mirroring `public.reputation` and
 * `public.compute_bayesian_rating` in migration 00010 exactly. The SQL and this
 * module must agree: the SQL is the source of truth that the database enforces,
 * and this is the same calculation made testable and reusable in the service.
 *
 * The central idea is that there are two different numbers and they are not
 * interchangeable:
 *
 *   averageRating   the true arithmetic mean of real reviews. This is what a
 *                   user is shown. It is never adjusted to look flattering.
 *
 *   bayesianRating  the same data smoothed toward a prior, used only to *order*
 *                   results in search. A consultant with one 5-star review
 *                   scores 5.00 on the average, which would put them level with
 *                   a consultant with two hundred reviews at 4.90. That is not a
 *                   quality signal, it is a signal that someone bought a
 *                   review, so ordering must account for volume.
 *
 * The smoothing is (C * m + sum) / (C + n). With C = 8 and m = 4.0, a single
 * 5-star review yields 4.15 rather than 5.00, and it takes roughly a dozen
 * consistent 5-star reviews to approach 4.8. The prior is a fixed constant
 * rather than the live marketplace mean, because a global mean would make every
 * participant's score drift as the population changes.
 */

/** Prior mean for a participant with no reviews: the marketplace average. */
export const REPUTATION_PRIOR_MEAN = 4.0;

/** Prior weight, in "average reviews". Decides how much inertia an empty
 *  or thin history carries. */
export const REPUTATION_PRIOR_WEIGHT = 8;

/**
 * A participant below this many reviews is not yet "proven" and should not be
 * ranked above established participants regardless of score. Used by search as a
 * filter, never to hide a review from its reader.
 */
export const MIN_REVIEWS_FOR_RANKING = 3;

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const RATING_SCALE = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATING_SCALE)[number];

export type RatingDimension = 'overall' | 'communication' | 'quality' | 'timeliness';

export const RATING_DIMENSIONS: readonly RatingDimension[] = [
  'overall',
  'communication',
  'quality',
  'timeliness',
] as const;

/** The fields a review contributes to the aggregate. */
export interface ReviewRatings {
  rating_overall: number;
  rating_communication: number;
  rating_quality: number;
  rating_timeliness: number;
}

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface ReputationSummary {
  average_rating: number;
  total_reviews: number;
  completed_projects: number;
  rating_distribution: RatingDistribution;
  dimension_averages: Record<RatingDimension, number>;
  /** Ordering aid only. Never presented as a rating. */
  ranking_score: number;
  has_public_reviews: boolean;
  /** False until MIN_REVIEWS_FOR_RANKING is reached. */
  is_proven: boolean;
}

/**
 * Bayesian-smoothed rating. Mirrors `public.compute_bayesian_rating`.
 *
 * With no reviews this returns the prior mean (4.00), which is deliberate: an
 * unreviewed participant is "average so far", not "zero stars". A stored 0.00
 * would rank every newcomer below every single-review participant regardless of
 * the latter's actual rating.
 */
export function computeBayesianRating(
  sumOfRatings: number,
  count: number,
  priorMean: number = REPUTATION_PRIOR_MEAN,
  priorWeight: number = REPUTATION_PRIOR_WEIGHT
): number {
  if (!Number.isFinite(sumOfRatings) || !Number.isInteger(count) || count < 0) {
    return round2(priorMean);
  }
  const total = priorWeight * priorMean + sumOfRatings;
  const denominator = priorWeight + count;
  if (denominator <= 0) return round2(priorMean);
  return round2(total / denominator);
}

/** Bucket reviews into the 1..5 distribution used by the display. */
export function buildRatingDistribution(overallRatings: readonly number[]): RatingDistribution {
  const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const rating of overallRatings) {
    if (rating >= RATING_MIN && rating <= RATING_MAX) {
      distribution[Math.trunc(rating) as Rating] += 1;
    }
  }
  return distribution;
}

/** Mean of the supplied ratings, or 0 for an empty set. */
export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return round2(total / values.length);
}

/**
 * Build the full display model from raw reviews.
 *
 * `reviews` must already be filtered to live, public rows. Passing a deleted
 * review in here would inflate both the average and the count, which is why the
 * SQL function applies `deleted_at IS NULL AND is_public` in the query rather
 * than relying on the caller.
 */
export function summarizeReputation(
  reviews: readonly ReviewRatings[],
  completedProjects = 0
): ReputationSummary {
  const total = reviews.length;
  const sumOverall = reviews.reduce((sum, review) => sum + review.rating_overall, 0);
  const averageOverall = average(reviews.map((review) => review.rating_overall));

  return {
    average_rating: averageOverall,
    total_reviews: total,
    completed_projects: completedProjects,
    rating_distribution: buildRatingDistribution(reviews.map((r) => r.rating_overall)),
    dimension_averages: {
      overall: averageOverall,
      communication: average(reviews.map((r) => r.rating_communication)),
      quality: average(reviews.map((r) => r.rating_quality)),
      timeliness: average(reviews.map((r) => r.rating_timeliness)),
    },
    ranking_score: computeBayesianRating(sumOverall, total),
    has_public_reviews: total > 0,
    is_proven: total >= MIN_REVIEWS_FOR_RANKING,
  };
}

/**
 * Order two participants by reputation, for a future search.
 *
 * Unproven participants sort below proven ones, and ties break on review volume
 * then on completed projects, so a rating that happened to land well is never
 * the only thing separating two equal candidates.
 */
export function compareReputation(a: ReputationSummary, b: ReputationSummary): number {
  if (a.is_proven !== b.is_proven) return a.is_proven ? -1 : 1;
  if (a.ranking_score !== b.ranking_score) return b.ranking_score - a.ranking_score;
  if (a.total_reviews !== b.total_reviews) return b.total_reviews - a.total_reviews;
  if (a.completed_projects !== b.completed_projects) {
    return b.completed_projects - a.completed_projects;
  }
  return 0;
}

/**
 * Percentage of reviews at each star level, for rendering distribution bars.
 * Returns all-zero entries when there is nothing to show rather than NaN.
 */
export function distributionPercentages(
  distribution: RatingDistribution
): Record<Rating, number> {
  const total = RATING_SCALE.reduce((sum, stars) => sum + distribution[stars], 0);
  if (total === 0) {
    return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }
  return {
    1: round2((distribution[1] / total) * 100),
    2: round2((distribution[2] / total) * 100),
    3: round2((distribution[3] / total) * 100),
    4: round2((distribution[4] / total) * 100),
    5: round2((distribution[5] / total) * 100),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
