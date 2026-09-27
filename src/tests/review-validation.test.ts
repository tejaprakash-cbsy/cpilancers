import { describe, expect, it } from 'vitest';
import {
  reviewCreateSchema,
  reviewUpdateSchema,
  reviewDeleteSchema,
  reviewFilterSchema,
  REVIEW_EDIT_WINDOW_DAYS,
  REVIEWABLE_CONTRACT_STATUS,
  REVIEW_BLOCK_MESSAGES,
  type ReviewBlockReason,
} from '@/lib/validations/review.schemas';

/**
 * Review input validation.
 *
 * These are the boundary checks. The rules that depend on other rows — who may
 * review, whether the contract is completed, whether a review already exists —
 * are enforced by the `enforce_review_integrity` trigger in migration 00010, and
 * are not expressible here.
 */

const validRatings = {
  rating_overall: 5,
  rating_communication: 4,
  rating_quality: 5,
  rating_timeliness: 3,
};

describe('review creation input', () => {
  it('accepts four whole-star ratings and optional feedback', () => {
    const parsed = reviewCreateSchema.parse(validRatings);
    expect(parsed.rating_overall).toBe(5);
    expect(parsed.is_public).toBe(true);
  });

  it('defaults to public, so ratings are never quietly invisible', () => {
    expect(reviewCreateSchema.parse(validRatings).is_public).toBe(true);
  });

  it('honours an explicit private choice', () => {
    expect(reviewCreateSchema.parse({ ...validRatings, is_public: false }).is_public).toBe(false);
  });

  it('rejects fractional ratings', () => {
    for (const field of [
      'rating_overall',
      'rating_communication',
      'rating_quality',
      'rating_timeliness',
    ] as const) {
      expect(() => reviewCreateSchema.parse({ ...validRatings, [field]: 4.5 })).toThrow();
    }
  });

  it('rejects ratings outside one to five', () => {
    for (const value of [0, -1, 6, 100]) {
      expect(() => reviewCreateSchema.parse({ ...validRatings, rating_overall: value })).toThrow();
    }
  });

  it('requires every dimension, so a review is never partially rated', () => {
    for (const field of [
      'rating_communication',
      'rating_quality',
      'rating_timeliness',
    ] as const) {
      const partial = { ...validRatings } as Record<string, unknown>;
      delete partial[field];
      expect(() => reviewCreateSchema.parse(partial)).toThrow();
    }
  });

  it('rejects a reviewee, because the party is derived from the contract', () => {
    expect(() =>
      reviewCreateSchema.parse({ ...validRatings, reviewee_user_id: 'some-user' })
    ).toThrow();
  });

  it('rejects a reviewer, because the author is the authenticated caller', () => {
    expect(() => reviewCreateSchema.parse({ ...validRatings, reviewer_user_id: 'some-user' })).toThrow();
  });

  it('rejects a contract id, because it comes from the route', () => {
    expect(() => reviewCreateSchema.parse({ ...validRatings, contract_id: 'some-contract' })).toThrow();
  });

  it('rejects a forged role claim', () => {
    expect(() => reviewCreateSchema.parse({ ...validRatings, reviewer_role: 'admin' })).toThrow();
  });

  it('rejects an attempt to write the aggregate directly', () => {
    expect(() => reviewCreateSchema.parse({ ...validRatings, avg_rating: 5 })).toThrow();
    expect(() => reviewCreateSchema.parse({ ...validRatings, total_reviews_count: 500 })).toThrow();
  });

  it('rejects an attempt to pre-set the review timestamp', () => {
    expect(() => reviewCreateSchema.parse({ ...validRatings, created_at: '2020-01-01' })).toThrow();
  });

  it('rejects overlong feedback', () => {
    expect(() =>
      reviewCreateSchema.parse({ ...validRatings, feedback_markdown: 'x'.repeat(5001) })
    ).toThrow();
    expect(() =>
      reviewCreateSchema.parse({ ...validRatings, feedback_markdown: 'x'.repeat(5000) })
    ).not.toThrow();
  });
});

describe('review update input', () => {
  it('accepts a single field change', () => {
    expect(reviewUpdateSchema.parse({ rating_overall: 3 })).toEqual({ rating_overall: 3 });
  });

  it('rejects an empty change rather than burning an audit row', () => {
    expect(() => reviewUpdateSchema.parse({})).toThrow();
  });

  it('still rejects a reassignment attempt', () => {
    expect(() => reviewUpdateSchema.parse({ reviewee_user_id: 'someone' })).toThrow();
    expect(() => reviewUpdateSchema.parse({ reviewer_user_id: 'someone' })).toThrow();
    expect(() => reviewUpdateSchema.parse({ contract_id: 'some-contract' })).toThrow();
  });

  it('rejects editing the edit counter directly', () => {
    expect(() => reviewUpdateSchema.parse({ edit_count: 0 })).toThrow();
  });

  it('applies the same rating bounds as creation', () => {
    expect(() => reviewUpdateSchema.parse({ rating_quality: 7 })).toThrow();
    expect(() => reviewUpdateSchema.parse({ rating_timeliness: 0 })).toThrow();
    expect(() => reviewUpdateSchema.parse({ rating_communication: 2.5 })).toThrow();
  });
});

describe('review deletion input', () => {
  it('requires a reason, so the audit trail always explains a removal', () => {
    expect(() => reviewDeleteSchema.parse({})).toThrow();
    expect(() => reviewDeleteSchema.parse({ reason: 'ab' })).toThrow();
    expect(reviewDeleteSchema.parse({ reason: 'Left identifying details in the review' })).toEqual({
      reason: 'Left identifying details in the review',
    });
  });
});

describe('review filters', () => {
  it('defaults to a sane first page', () => {
    const parsed = reviewFilterSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.live_only).toBe(true);
  });

  it('bounds the page size', () => {
    expect(() => reviewFilterSchema.parse({ limit: 0 })).toThrow();
    expect(() => reviewFilterSchema.parse({ limit: 51 })).toThrow();
    expect(() => reviewFilterSchema.parse({ limit: 50 })).not.toThrow();
  });

  it('rejects a rating filter outside the scale', () => {
    expect(() => reviewFilterSchema.parse({ min_rating: 6 })).toThrow();
    expect(() => reviewFilterSchema.parse({ min_rating: 0 })).toThrow();
  });

  it('rejects a non-uuid reviewee filter', () => {
    expect(() => reviewFilterSchema.parse({ reviewee_user_id: 'nope' })).toThrow();
  });
});

describe('rule constants', () => {
  it('requires the completed contract status', () => {
    expect(REVIEWABLE_CONTRACT_STATUS).toBe('completed');
  });

  it('uses a bounded edit window', () => {
    expect(REVIEW_EDIT_WINDOW_DAYS).toBe(7);
  });

  it('has a distinct, non-empty message for every block reason', () => {
    const reasons: ReviewBlockReason[] = [
      'contract_not_completed',
      'already_reviewed',
      'not_a_participant',
      'self_review',
      'counterpart_reviewee_missing',
      'edit_window_closed',
      'review_already_deleted',
    ];
    for (const reason of reasons) {
      expect(REVIEW_BLOCK_MESSAGES[reason]).toBeTruthy();
      expect(REVIEW_BLOCK_MESSAGES[reason].length).toBeGreaterThan(10);
    }
    // Distinct wording, so a UI cannot show the same message for two problems.
    const messages = reasons.map((r) => REVIEW_BLOCK_MESSAGES[r]);
    expect(new Set(messages).size).toBe(reasons.length);
  });
});
