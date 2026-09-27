import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Service-level tests for `ReviewService`.
 *
 * The Stage 11 audit found that the authorization logic behind the broken routes
 * was sound but entirely untested, because all 54 Stage 11 tests targeted pure
 * functions. These tests drive the real service against a mocked Supabase client
 * and assert on the properties the brief calls out: authorship, the edit
 * window, the identity fields the service must never patch, and the refusal to
 * turn a database error into a fabricated zero reputation.
 *
 * The mock records every call so a test can prove *which* row was written and
 * *which columns* were touched, not merely that a call happened.
 */

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

type Result = { data: unknown; error: unknown };
type Handler = (op: string) => Result;

const calls: { table: string; op: string; args: unknown[] }[] = [];
let handler: Handler = () => ({ data: null, error: null });

function record(table: string, op: string, args: unknown[] = []) {
  calls.push({ table, op, args });
  return handler(op);
}

/** Minimal fluent stand-in for a supabase-js query builder. */
function builder(table: string) {
  const api: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      const r = record(table, 'select', args);
      api._result = r;
      return api;
    },
    insert: (...args: unknown[]) => {
      const r = record(table, 'insert', args);
      api._result = r;
      return api;
    },
    update: (...args: unknown[]) => {
      const r = record(table, 'update', args);
      api._result = r;
      return api;
    },
    eq: (...args: unknown[]) => {
      record(table, 'eq', args);
      return api;
    },
    is: (...args: unknown[]) => {
      record(table, 'is', args);
      return api;
    },
    gte: () => api,
    or: (...args: unknown[]) => {
      record(table, 'or', args);
      return api;
    },
    order: () => api,
    range: () => api,
    single: async () => (api._result as Result) ?? { data: null, error: null },
    maybeSingle: async () => (api._result as Result) ?? { data: null, error: null },
    then: (resolve: (v: Result) => unknown) => resolve((api._result as Result) ?? { data: null, error: null }),
  };
  return api;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

import { ReviewService } from '@/services/review.service';
import { reviewEditWindowMs } from '@/lib/validations/review.schemas';
import { MIN_REVIEWS_FOR_RANKING } from '@/lib/reviews/reputation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTHOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STRANGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REVIEW_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function hoursAgo(n: number) {
  return new Date(Date.now() - n * 3600_000).toISOString();
}

function makeReview(over: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    contract_id: CONTRACT_ID,
    reviewer_user_id: AUTHOR,
    reviewee_user_id: STRANGER,
    reviewer_role: 'consultant',
    reviewee_role: 'client',
    rating_overall: 5,
    rating_communication: 5,
    rating_quality: 5,
    rating_timeliness: 5,
    feedback_markdown: null,
    is_public: true,
    edit_count: 0,
    edited_at: null,
    deleted_at: null,
    deleted_by_user_id: null,
    deletion_reason: null,
    contract_completed_at: hoursAgo(24),
    created_at: hoursAgo(2),
    updated_at: hoursAgo(2),
    ...over,
  };
}

/** A `reviews` single-select returns this review; everything else is empty. */
function withReview(review: Record<string, unknown> | null) {
  handler = (op) => {
    if (op === 'select') return { data: review, error: null };
    return { data: review, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  handler = () => ({ data: null, error: null });
});

// ===========================================================================
// updateReview — authorship
// ===========================================================================

describe('updateReview: only the author may edit', () => {
  it('rejects a non-author before any write is attempted', async () => {
    withReview(makeReview());
    await expect(
      ReviewService.updateReview(REVIEW_ID, STRANGER, { rating_overall: 1 })
    ).rejects.toMatchObject({ statusCode: 403 });

    const writes = calls.filter((c) => c.op === 'update');
    expect(writes).toHaveLength(0);
  });

  it('allows the author and scopes the write to their own review', async () => {
    withReview(makeReview());
    await ReviewService.updateReview(REVIEW_ID, AUTHOR, { rating_overall: 3 });
    const writes = calls.filter((c) => c.op === 'update');
    expect(writes).toHaveLength(1);
    // The eq() chain must pin both the id and the author.
    const eqs = calls.filter((c) => c.op === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['id', REVIEW_ID]);
    expect(eqs).toContainEqual(['reviewer_user_id', AUTHOR]);
  });

  it('refuses an edit past the window without touching the row', async () => {
    withReview(makeReview({ created_at: hoursAgo(24 * 30) }));
    await expect(
      ReviewService.updateReview(REVIEW_ID, AUTHOR, { rating_overall: 1 })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('allows an edit inside the window', async () => {
    const recent = makeReview({ created_at: new Date(Date.now() - 1000).toISOString() });
    withReview(recent);
    await expect(
      ReviewService.updateReview(REVIEW_ID, AUTHOR, { rating_overall: 1 })
    ).resolves.toBeTruthy();
  });

  it('never patches an identity field, even if one is smuggled in', async () => {
    withReview(makeReview());
    await ReviewService.updateReview(REVIEW_ID, AUTHOR, {
      rating_overall: 4,
      // Cast because the real signature does not accept these; this proves the
      // implementation ignores them rather than the type stopping it.
      ...({ reviewee_user_id: STRANGER, reviewer_user_id: STRANGER, contract_id: CONTRACT_ID } as object),
    } as Parameters<typeof ReviewService.updateReview>[2]);

    const write = calls.find((c) => c.op === 'update');
    const patch = write?.args[0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(
      ['edit_count', 'edited_at', 'rating_overall'].sort()
    );
    expect(patch).not.toHaveProperty('reviewer_user_id');
    expect(patch).not.toHaveProperty('reviewee_user_id');
    expect(patch).not.toHaveProperty('contract_id');
    expect(patch).not.toHaveProperty('reviewer_role');
  });

  it('increments edit_count and stamps edited_at', async () => {
    withReview(makeReview({ edit_count: 3 }));
    await ReviewService.updateReview(REVIEW_ID, AUTHOR, { rating_overall: 4 });
    const patch = calls.find((c) => c.op === 'update')?.args[0] as Record<string, unknown>;
    expect(patch.edit_count).toBe(4);
    expect(patch.edited_at).toBeTruthy();
  });

  it('refuses to edit a soft-deleted review', async () => {
    withReview(makeReview({ deleted_at: hoursAgo(1) }));
    await expect(
      ReviewService.updateReview(REVIEW_ID, AUTHOR, { rating_overall: 1 })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('404s a review that does not exist', async () => {
    withReview(null);
    await expect(
      ReviewService.updateReview(REVIEW_ID, AUTHOR, { rating_overall: 1 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ===========================================================================
// deleteReview — the author/admin matrix
// ===========================================================================

describe('deleteReview: authorization matrix', () => {
  it('lets the author withdraw their own review inside the window', async () => {
    withReview(makeReview());
    await expect(
      ReviewService.deleteReview(REVIEW_ID, AUTHOR, false, 'withdrawn by mistake')
    ).resolves.toMatchObject({ deleted: true });
  });

  it('refuses a non-author, non-admin', async () => {
    withReview(makeReview());
    await expect(
      ReviewService.deleteReview(REVIEW_ID, STRANGER, false, 'not mine')
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it("lets an admin remove any review, including someone else's", async () => {
    withReview(makeReview());
    await expect(
      ReviewService.deleteReview(REVIEW_ID, 'admin-id', true, 'policy violation')
    ).resolves.toMatchObject({ deleted: true });
  });

  it("refuses the author's own late withdrawal", async () => {
    withReview(makeReview({ created_at: hoursAgo(24 * 30) }));
    await expect(
      ReviewService.deleteReview(REVIEW_ID, AUTHOR, false, 'too late now')
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('still lets an admin remove a settled review (moderation is exempt)', async () => {
    withReview(makeReview({ created_at: hoursAgo(24 * 365) }));
    await expect(
      ReviewService.deleteReview(REVIEW_ID, 'admin-id', true, 'abuse')
    ).resolves.toMatchObject({ deleted: true });
  });

  it('records who deleted it and why', async () => {
    withReview(makeReview());
    await ReviewService.deleteReview(REVIEW_ID, AUTHOR, false, 'posted in the wrong contract');
    const patch = calls.find((c) => c.op === 'update')?.args[0] as Record<string, unknown>;
    expect(patch.deleted_by_user_id).toBe(AUTHOR);
    expect(patch.deletion_reason).toBe('posted in the wrong contract');
    expect(patch.deleted_at).toBeTruthy();
  });

  it('writes a deleted audit row, so a vanished rating stays explainable', async () => {
    withReview(makeReview());
    await ReviewService.deleteReview(REVIEW_ID, AUTHOR, false, 'withdrawn');
    const audit = calls.find((c) => c.table === 'review_edits' && c.op === 'insert');
    expect(audit).toBeTruthy();
    const row = audit?.args[0] as Record<string, unknown>;
    expect(row.action).toBe('deleted');
    expect(row.editor_user_id).toBe(AUTHOR);
    expect(row.before_state).toBeTruthy();
  });

  it('refuses to delete an already-deleted review', async () => {
    withReview(makeReview({ deleted_at: hoursAgo(5) }));
    await expect(
      ReviewService.deleteReview(REVIEW_ID, AUTHOR, false, 'again')
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('404s a review that does not exist', async () => {
    withReview(null);
    await expect(
      ReviewService.deleteReview(REVIEW_ID, AUTHOR, false, 'gone')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('is a soft delete, never a row removal', async () => {
    withReview(makeReview());
    await ReviewService.deleteReview(REVIEW_ID, AUTHOR, false, 'withdrawn');
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });
});

// ===========================================================================
// getReputation — never fabricate a zero summary from an error
// ===========================================================================

describe('getReputation: a failed lookup is not an empty reputation', () => {
  it('raises rather than returning zeros when the aggregate query errors', async () => {
    handler = (op) =>
      op === 'select' ? { data: null, error: { message: 'boom' } } : { data: null, error: null };

    await expect(ReviewService.getReputation(STRANGER)).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('raises rather than returning zeros when the review fallback errors', async () => {
    // reputation row missing (legit), but the reviews read then fails.
    let selectCount = 0;
    handler = (op) => {
      if (op !== 'select') return { data: null, error: null };
      selectCount += 1;
      if (selectCount === 1) return { data: null, error: null }; // no aggregate row
      return { data: null, error: { message: 'timeout' } };
    };
    await expect(ReviewService.getReputation(STRANGER)).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('returns real stored values when the aggregate row exists', async () => {
    handler = (op) => {
      if (op !== 'select') return { data: null, error: null };
      return {
        data: {
          user_id: STRANGER,
          total_reviews_count: 12,
          completed_contracts_count: 7,
          avg_rating_overall: 4.5,
          avg_rating_communication: 4.4,
          avg_rating_quality: 4.6,
          avg_rating_timeliness: 4.3,
          bayesian_rating: 4.44,
          rating_distribution: { '1': 0, '2': 0, '3': 1, '4': 4, '5': 7 },
        },
        error: null,
      };
    };
    const summary = await ReviewService.getReputation(STRANGER);
    expect(summary.average_rating).toBe(4.5);
    expect(summary.total_reviews).toBe(12);
    expect(summary.completed_projects).toBe(7);
    expect(summary.rating_distribution[5]).toBe(7);
    expect(summary.ranking_score).toBe(4.44);
  });

  it('reports a genuinely unreviewed participant as having no reviews', async () => {
    // No aggregate row and no reviews is a real zero, not a masked failure.
    handler = () => ({ data: null, error: null });
    const summary = await ReviewService.getReputation(STRANGER);
    expect(summary.total_reviews).toBe(0);
    expect(summary.average_rating).toBe(0);
    expect(summary.has_public_reviews).toBe(false);
    expect(summary.is_proven).toBe(false);
    // The prior keeps an unreviewed participant from being ranked last.
    expect(summary.ranking_score).toBe(4);
  });

  it('derives is_proven from the shared constant, not a literal', async () => {
    const build = (count: number) => {
      handler = (op) =>
        op === 'select'
          ? {
              data: {
                user_id: STRANGER,
                total_reviews_count: count,
                completed_contracts_count: count,
                avg_rating_overall: 4.5,
                avg_rating_communication: 4.5,
                avg_rating_quality: 4.5,
                avg_rating_timeliness: 4.5,
                bayesian_rating: 4.5,
                rating_distribution: { '5': count },
              },
              error: null,
            }
          : { data: null, error: null };
    };
    build(MIN_REVIEWS_FOR_RANKING - 1);
    expect((await ReviewService.getReputation(STRANGER)).is_proven).toBe(false);
    build(MIN_REVIEWS_FOR_RANKING);
    expect((await ReviewService.getReputation(STRANGER)).is_proven).toBe(true);
  });
});

// ===========================================================================
// Reputation integrity: no service path writes an aggregate
// ===========================================================================

describe('reputation integrity', () => {
  it('never writes the reputation table from a review mutation', async () => {
    withReview(makeReview());
    await ReviewService.updateReview(REVIEW_ID, AUTHOR, { rating_overall: 4 });
    await ReviewService.deleteReview(REVIEW_ID, AUTHOR, false, 'done');

    const reputationWrites = calls.filter(
      (c) => c.table === 'reputation' && (c.op === 'insert' || c.op === 'update')
    );
    // The trigger owns the aggregate; no service method may set a rating.
    expect(reputationWrites).toHaveLength(0);
  });

  it('accepts no caller-supplied aggregate value on create', async () => {
    handler = () => ({ data: null, error: null });
    await expect(
      ReviewService.createReview(CONTRACT_ID, AUTHOR, {
        rating_overall: 5,
        rating_communication: 5,
        rating_quality: 5,
        rating_timeliness: 5,
        avg_rating: 5,
        total_reviews_count: 500,
        bayesian_rating: 5,
      } as Parameters<typeof ReviewService.createReview>[2])
    ).rejects.toBeTruthy();

    const insert = calls.find((c) => c.table === 'reviews' && c.op === 'insert');
    if (insert) {
      const row = insert.args[0] as Record<string, unknown>;
      expect(row).not.toHaveProperty('avg_rating');
      expect(row).not.toHaveProperty('total_reviews_count');
      expect(row).not.toHaveProperty('bayesian_rating');
    }
  });

  it('uses a 7-day window constant shared with the validation layer', () => {
    expect(reviewEditWindowMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
