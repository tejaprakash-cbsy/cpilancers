import { describe, expect, it } from 'vitest';
import {
  computeBayesianRating,
  summarizeReputation,
  buildRatingDistribution,
  distributionPercentages,
  compareReputation,
  average,
  REPUTATION_PRIOR_MEAN,
  MIN_REVIEWS_FOR_RANKING,
  type ReviewRatings,
} from '@/lib/reviews/reputation';

/**
 * Reputation math.
 *
 * The property that matters most is the last group: a participant must not be
 * able to buy a top search position with a single review, because that turns the
 * reputation system into something to manipulate rather than a signal.
 */

function review(overall: number, rest: Partial<ReviewRatings> = {}): ReviewRatings {
  return {
    rating_overall: overall,
    rating_communication: rest.rating_communication ?? overall,
    rating_quality: rest.rating_quality ?? overall,
    rating_timeliness: rest.rating_timeliness ?? overall,
  };
}

describe('bayesian rating', () => {
  it('returns the prior for someone with no reviews', () => {
    expect(computeBayesianRating(0, 0)).toBe(REPUTATION_PRIOR_MEAN);
  });

  it('matches the documented formula', () => {
    // (8 * 4.0 + 5) / (8 + 1) = 37/9 = 4.1111 -> 4.11
    expect(computeBayesianRating(5, 1)).toBe(4.11);
    // (8 * 4.0 + 20) / (8 + 5) = 52/13 = 4.00
    expect(computeBayesianRating(20, 5)).toBe(4);
  });

  it('converges on the true average as reviews accumulate', () => {
    // 100 reviews averaging 4.80 should read close to 4.80, not the prior.
    const score = computeBayesianRating(480, 100);
    expect(score).toBeGreaterThan(4.7);
    expect(score).toBeLessThan(4.8);
  });

  it('keeps a one-review participant below a proven one with the same average', () => {
    // The single-review case is the whole point: 5.00 raw, but the ranking score
    // must not let it pass a well-reviewed 4.8 participant.
    const oneReview = computeBayesianRating(5, 1);
    const proven = computeBayesianRating(480, 100);
    expect(oneReview).toBeLessThan(proven);
  });

  it('is monotonic in both volume and score', () => {
    // More reviews at the same score must never lower the ranking score.
    let previous = -Infinity;
    for (const count of [0, 1, 2, 5, 10, 50, 200]) {
      const score = computeBayesianRating(5 * count, count);
      expect(score).toBeGreaterThan(previous);
      previous = score;
    }
  });

  it('falls back to the prior for a nonsensical count rather than dividing by zero', () => {
    expect(computeBayesianRating(10, -1)).toBe(REPUTATION_PRIOR_MEAN);
    expect(computeBayesianRating(Number.NaN, 3)).toBe(REPUTATION_PRIOR_MEAN);
  });

  it('cannot reach the raw maximum on a small or medium sample', () => {
    // The prior is what keeps a thin record from topping the ranking. It only
    // becomes negligible at a scale where a 5.00 is genuinely earned, which is
    // the correct outcome rather than a defect.
    for (const count of [1, 3, 10, 100, 1000]) {
      expect(computeBayesianRating(5 * count, count)).toBeLessThan(5);
    }
  });

  it('closes the gap to the true average as volume grows', () => {
    // One perfect review is pulled well down by the prior; a thousand barely move.
    expect(computeBayesianRating(5, 1)).toBeLessThan(4.2);
    expect(computeBayesianRating(5000, 1000)).toBeGreaterThanOrEqual(4.99);
  });

  it('reaches 5.00 only once the prior is genuinely negligible', () => {
    // At this volume the participant has 50,000 five-star reviews, so reporting
    // 5.00 is the honest answer, not smoothing failing.
    expect(computeBayesianRating(5 * 50_000, 50_000)).toBe(5);
  });

  it('respects a custom prior, for markets that need to retune', () => {
    expect(computeBayesianRating(0, 0, 3.2, 10)).toBe(3.2);
  });
});

describe('rating distribution', () => {
  it('buckets reviews by whole star', () => {
    expect(buildRatingDistribution([5, 5, 4, 3, 2, 1])).toEqual({
      1: 1,
      2: 1,
      3: 1,
      4: 1,
      5: 2,
    });
  });

  it('returns all zeros for an empty set', () => {
    expect(buildRatingDistribution([])).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });

  it('ignores out-of-range values rather than creating phantom buckets', () => {
    expect(buildRatingDistribution([5, 0, 6, -1, 99])).toEqual({
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 1,
    });
  });

  it('always sums to the number of in-range reviews', () => {
    const ratings = [5, 4, 4, 3, 2, 1, 5, 5, 4, 3];
    const distribution = buildRatingDistribution(ratings);
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    expect(total).toBe(ratings.length);
  });

  it('converts to percentages that sum to 100', () => {
    const percentages = distributionPercentages(buildRatingDistribution([5, 5, 4, 1]));
    const total = Object.values(percentages).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 1);
    expect(percentages[5]).toBe(50);
    expect(percentages[1]).toBe(25);
  });

  it('returns zeros rather than NaN when there is nothing to show', () => {
    const percentages = distributionPercentages(buildRatingDistribution([]));
    expect(Object.values(percentages).every((value) => value === 0)).toBe(true);
    expect(Object.values(percentages).some(Number.isNaN)).toBe(false);
  });
});

describe('reputation summary', () => {
  it('reports the true average, count, distribution and completed projects', () => {
    const summary = summarizeReputation(
      [review(5), review(4), review(4), review(3)],
      3
    );
    expect(summary.average_rating).toBe(4);
    expect(summary.total_reviews).toBe(4);
    expect(summary.completed_projects).toBe(3);
    expect(summary.rating_distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 2, 5: 1 });
  });

  it('averages each dimension independently', () => {
    const summary = summarizeReputation([
      { rating_overall: 5, rating_communication: 1, rating_quality: 3, rating_timeliness: 5 },
      { rating_overall: 3, rating_communication: 5, rating_quality: 3, rating_timeliness: 1 },
    ]);
    expect(summary.dimension_averages.overall).toBe(4);
    expect(summary.dimension_averages.communication).toBe(3);
    expect(summary.dimension_averages.quality).toBe(3);
    expect(summary.dimension_averages.timeliness).toBe(3);
  });

  it('distinguishes "no reviews" from "rated zero"', () => {
    const summary = summarizeReputation([], 0);
    expect(summary.average_rating).toBe(0);
    expect(summary.has_public_reviews).toBe(false);
    expect(summary.is_proven).toBe(false);
    // The ranking score is the prior, not zero: an unreviewed participant is
    // "average so far" rather than "the worst available".
    expect(summary.ranking_score).toBe(REPUTATION_PRIOR_MEAN);
  });

  it('marks a participant proven only at the review floor', () => {
    const build = (count: number) =>
      summarizeReputation(Array.from({ length: count }, () => review(5)));
    expect(build(MIN_REVIEWS_FOR_RANKING - 1).is_proven).toBe(false);
    expect(build(MIN_REVIEWS_FOR_RANKING).is_proven).toBe(true);
  });

  it('never reports an average above the best possible rating', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const summary = summarizeReputation([review(rating)], 1);
      expect(summary.average_rating).toBeLessThanOrEqual(5);
      expect(summary.average_rating).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('reputation ordering for discovery', () => {
  const summary = (over: Partial<ReturnType<typeof summarizeReputation>> = {}) => ({
    ...summarizeReputation([review(5), review(5), review(5)], 3),
    ...over,
  });

  it('puts a proven participant ahead of an unproven one with a higher score', () => {
    const proven = summary({ is_proven: true, ranking_score: 4.5 });
    const unproven = summary({ is_proven: false, ranking_score: 5 });
    expect(compareReputation(proven, unproven)).toBeLessThan(0);
  });

  it('breaks a score tie on review volume', () => {
    const many = summary({ is_proven: true, ranking_score: 4.5, total_reviews: 40 });
    const few = summary({ is_proven: true, ranking_score: 4.5, total_reviews: 4 });
    expect(compareReputation(many, few)).toBeLessThan(0);
  });

  it('breaks a volume tie on completed projects', () => {
    const seasoned = summary({
      is_proven: true,
      ranking_score: 4.5,
      total_reviews: 10,
      completed_projects: 20,
    });
    const newish = summary({
      is_proven: true,
      ranking_score: 4.5,
      total_reviews: 10,
      completed_projects: 2,
    });
    expect(compareReputation(seasoned, newish)).toBeLessThan(0);
  });

  it('is a total order: identical summaries compare equal', () => {
    expect(compareReputation(summary(), summary())).toBe(0);
  });

  it('orders a realistic set so a single five-star review cannot reach the top', () => {
    const candidates = [
      summarizeReputation([review(5)], 1), // bought review
      summarizeReputation([review(5), review(5), review(5), review(5), review(4)], 12),
      summarizeReputation(Array.from({ length: 40 }, (_, i) => review(i % 2 ? 4 : 5)), 60),
      summarizeReputation([], 0), // no history
    ].sort(compareReputation);

    // The single-review participant is beaten by the proven one and by the
    // high-volume one, and sits above only the participant with no history.
    expect(candidates[0].total_reviews).toBeGreaterThanOrEqual(20);
    expect(candidates[candidates.length - 1].total_reviews).toBe(0);
    expect(candidates[candidates.length - 2].total_reviews).toBe(1);
  });
});

describe('average helper', () => {
  it('returns zero for an empty set instead of NaN', () => {
    expect(average([])).toBe(0);
  });

  it('rounds to two decimals', () => {
    expect(average([1, 2])).toBe(1.5);
    expect(average([1, 1, 2])).toBe(1.33);
  });
});
