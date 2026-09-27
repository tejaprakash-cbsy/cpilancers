import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level tests for the Stage 11 review endpoints.
 *
 * These exist because the Stage 11 audit found that 54 pure-function tests
 * passed while three of four endpoints were completely non-functional. Every
 * test here drives the real exported handler with a real `NextRequest` and
 * asserts on the identifier that actually reaches the service, which is the
 * property whose failure produced findings C1 and C2.
 *
 * The dynamic segment is the LEAF of each route, so `.at(-2)` is wrong and
 * `.pop()` is right. A regression back to `.at(-2)` must fail these tests.
 */

// ---------------------------------------------------------------------------
// Mocks. Declared before importing the handlers so the modules pick them up.
// ---------------------------------------------------------------------------

const mockGetCurrentUser = vi.fn();
const mockGetReputation = vi.fn();
const mockListReviews = vi.fn();
const mockUpdateReview = vi.fn();
const mockDeleteReview = vi.fn();
const mockGetEligibility = vi.fn();
const mockCreateReview = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args) },
}));

vi.mock('@/services/review.service', () => ({
  ReviewService: {
    getReputation: (...args: unknown[]) => mockGetReputation(...args),
    listReviews: (...args: unknown[]) => mockListReviews(...args),
    updateReview: (...args: unknown[]) => mockUpdateReview(...args),
    deleteReview: (...args: unknown[]) => mockDeleteReview(...args),
    getEligibility: (...args: unknown[]) => mockGetEligibility(...args),
    createReview: (...args: unknown[]) => mockCreateReview(...args),
  },
}));

import { PATCH, DELETE } from '@/app/api/reviews/[id]/route';
import { GET as GET_REPUTATION } from '@/app/api/reputation/[userId]/route';
import { GET as GET_CONTRACT_REVIEW, POST as POST_CONTRACT_REVIEW } from '@/app/api/contracts/[id]/review/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REVIEW_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_REVIEW_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONTRACT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const reviewer = { id: USER_ID, role: 'consultant' as const };

function reviewPatch(body: unknown, path = `/api/reviews/${REVIEW_ID}`) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function reviewDelete(body: unknown, path = `/api/reviews/${REVIEW_ID}`) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function reputationGet(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(reviewer);
  mockUpdateReview.mockResolvedValue({
    id: REVIEW_ID,
    rating_overall: 4,
    rating_communication: 4,
    rating_quality: 5,
    rating_timeliness: 4,
    feedback_markdown: 'good work',
    is_public: true,
    edit_count: 1,
    edited_at: '2026-01-02T00:00:00.000Z',
  });
  mockDeleteReview.mockResolvedValue({
    deleted: true,
    review: { id: REVIEW_ID, deleted_at: '2026-01-02T00:00:00.000Z' },
  });
  mockGetReputation.mockResolvedValue({
    average_rating: 4.5,
    total_reviews: 12,
    completed_projects: 7,
    rating_distribution: { 1: 0, 2: 0, 3: 1, 4: 4, 5: 7 },
    dimension_averages: { overall: 4.5, communication: 4.4, quality: 4.6, timeliness: 4.3 },
    ranking_score: 4.44,
    has_public_reviews: true,
    is_proven: true,
  });
});

// ===========================================================================
// C2 — review PATCH / DELETE identifier
// ===========================================================================

describe('C2: PATCH /api/reviews/[id] passes the real review id', () => {
  it('sends the leaf segment to the service, not the literal "reviews"', async () => {
    const res = await PATCH(reviewPatch({ rating_overall: 4 }));
    expect(res.status).toBe(200);
    expect(mockUpdateReview).toHaveBeenCalledTimes(1);
    // This exact assertion is what C2 broke: it received "reviews".
    expect(mockUpdateReview.mock.calls[0][0]).toBe(REVIEW_ID);
  });

  it('distinguishes two different review ids', async () => {
    mockUpdateReview.mockResolvedValue({ id: OTHER_REVIEW_ID, edit_count: 1 });
    await PATCH(reviewPatch({ rating_overall: 3 }, `/api/reviews/${OTHER_REVIEW_ID}`));
    expect(mockUpdateReview.mock.calls[0][0]).toBe(OTHER_REVIEW_ID);
  });

  it('rejects a malformed id with 400 and never calls the service', async () => {
    const res = await PATCH(reviewPatch({ rating_overall: 4 }, '/api/reviews/not-a-uuid'));
    expect(res.status).toBe(400);
    expect(mockUpdateReview).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await PATCH(reviewPatch({ rating_overall: 4 }));
    expect(res.status).toBe(401);
    expect(mockUpdateReview).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range rating before reaching the service', async () => {
    for (const rating of [0, 6, -1, 4.5]) {
      mockUpdateReview.mockClear();
      const res = await PATCH(reviewPatch({ rating_overall: rating }));
      expect(res.status).toBe(400);
      expect(mockUpdateReview).not.toHaveBeenCalled();
    }
  });

  it('rejects an identity-field reassignment attempt', async () => {
    for (const key of ['reviewer_user_id', 'reviewee_user_id', 'contract_id', 'reviewer_role']) {
      mockUpdateReview.mockClear();
      const res = await PATCH(reviewPatch({ [key]: 'some-value' }));
      expect(res.status).toBe(400);
      expect(mockUpdateReview).not.toHaveBeenCalled();
    }
  });

  it('rejects an attempt to forge the edit counter', async () => {
    const res = await PATCH(reviewPatch({ edit_count: 0 }));
    expect(res.status).toBe(400);
    expect(mockUpdateReview).not.toHaveBeenCalled();
  });

  it('rejects an empty no-op body', async () => {
    const res = await PATCH(reviewPatch({}));
    expect(res.status).toBe(400);
    expect(mockUpdateReview).not.toHaveBeenCalled();
  });

  it('propagates a service 403 without rewriting the id', async () => {
    const { ForbiddenError } = await import('@/lib/errors');
    mockUpdateReview.mockRejectedValue(new ForbiddenError('Only the author of a review can change it.'));
    const res = await PATCH(reviewPatch({ rating_overall: 4 }));
    expect(res.status).toBe(403);
    expect(mockUpdateReview.mock.calls[0][0]).toBe(REVIEW_ID);
  });

  it('propagates a service 404 for a review that does not exist', async () => {
    const { NotFoundError } = await import('@/lib/errors');
    mockUpdateReview.mockRejectedValue(new NotFoundError('Review'));
    const res = await PATCH(reviewPatch({ rating_overall: 4 }));
    expect(res.status).toBe(404);
  });
});

describe('C2: DELETE /api/reviews/[id] passes the real review id', () => {
  it('sends the leaf segment to the service, not the literal "reviews"', async () => {
    const res = await DELETE(reviewDelete({ reason: 'withdrawn by mistake' }));
    expect(res.status).toBe(200);
    expect(mockDeleteReview).toHaveBeenCalledTimes(1);
    expect(mockDeleteReview.mock.calls[0][0]).toBe(REVIEW_ID);
  });

  it('requires authentication', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await DELETE(reviewDelete({ reason: 'withdrawn by mistake' }));
    expect(res.status).toBe(401);
    expect(mockDeleteReview).not.toHaveBeenCalled();
  });

  it('rejects a malformed id with 400', async () => {
    const res = await DELETE(reviewDelete({ reason: 'ok reason' }, '/api/reviews/12345'));
    expect(res.status).toBe(400);
    expect(mockDeleteReview).not.toHaveBeenCalled();
  });

  it('requires a deletion reason', async () => {
    const res = await DELETE(reviewDelete({}));
    expect(res.status).toBe(400);
    expect(mockDeleteReview).not.toHaveBeenCalled();
  });

  it('passes the admin flag from the server-derived role, not the request', async () => {
    await DELETE(reviewDelete({ reason: 'moderation removal' }));
    // reviewId, userId, isAdmin, reason
    expect(mockDeleteReview.mock.calls[0][2]).toBe(false);

    mockGetCurrentUser.mockResolvedValue({ id: USER_ID, role: 'admin' as const });
    mockDeleteReview.mockClear();
    await DELETE(reviewDelete({ reason: 'moderation removal' }));
    expect(mockDeleteReview.mock.calls[0][2]).toBe(true);
  });

  it('cannot be talked into admin by a body field', async () => {
    const res = await DELETE(reviewDelete({ reason: 'forged admin', role: 'admin', isAdmin: true }));
    // The strict schema rejects the extra fields outright.
    expect(res.status).toBe(400);
    expect(mockDeleteReview).not.toHaveBeenCalled();
  });

  it('propagates a service 403 when the caller is not the author', async () => {
    const { ForbiddenError } = await import('@/lib/errors');
    mockDeleteReview.mockRejectedValue(new ForbiddenError('Only the author of a review can delete it.'));
    const res = await DELETE(reviewDelete({ reason: 'not mine to delete' }));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// C1 — reputation identifier and error transparency
// ===========================================================================

describe('C1: GET /api/reputation/[userId] passes the real user id', () => {
  it('sends the leaf segment to the service, not the literal "reputation"', async () => {
    const res = await GET_REPUTATION(reputationGet(`/api/reputation/${USER_ID}`));
    expect(res.status).toBe(200);
    // This exact assertion is what C1 broke: it received "reputation".
    expect(mockGetReputation.mock.calls[0][0]).toBe(USER_ID);
  });

  it('returns the real reputation, not an all-zero summary', async () => {
    const res = await GET_REPUTATION(reputationGet(`/api/reputation/${USER_ID}`));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.average_rating).toBe(4.5);
    expect(body.data.total_reviews).toBe(12);
    expect(body.data.completed_projects).toBe(7);
    expect(body.data.rating_distribution[5]).toBe(7);
    expect(body.data.rating_percentages[5]).toBeCloseTo(58.33, 1);
  });

  it('rejects a malformed id with 400 and never calls the service', async () => {
    const res = await GET_REPUTATION(reputationGet('/api/reputation/reputation'));
    expect(res.status).toBe(400);
    expect(mockGetReputation).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid path segment with 400', async () => {
    for (const path of ['/api/reputation/12345', '/api/reputation/', '/api/reputation/abc-def']) {
      mockGetReputation.mockClear();
      const res = await GET_REPUTATION(reputationGet(path));
      expect(res.status).toBe(400);
      expect(mockGetReputation).not.toHaveBeenCalled();
    }
  });

  it('surfaces a database failure as a 5xx rather than a fake zero summary', async () => {
    // The heart of C1: a failed lookup must not become HTTP 200 with zeros.
    const { AppError } = await import('@/lib/errors');
    mockGetReputation.mockRejectedValue(
      new AppError('Failed to load reputation.', 500, 'REPUTATION_FETCH_ERROR', {})
    );
    const res = await GET_REPUTATION(reputationGet(`/api/reputation/${USER_ID}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
  });

  it('is reachable without authentication, by design', async () => {
    mockGetCurrentUser.mockClear();
    const res = await GET_REPUTATION(reputationGet(`/api/reputation/${USER_ID}`));
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Regression guard: the contract-scoped route used .at(-2) correctly
// ===========================================================================

describe('contract review route keeps working (the .at(-2) case that was correct)', () => {
  it('resolves the contract id from /api/contracts/<id>/review', async () => {
    mockGetEligibility.mockResolvedValue({
      canReview: true,
      reason: null,
      revieweeUserId: OTHER_REVIEW_ID,
      existingReview: null,
      counterpartHasReviewed: false,
      editable: false,
    });
    const res = await GET_CONTRACT_REVIEW(
      new NextRequest(`http://localhost/api/contracts/${CONTRACT_ID}/review`)
    );
    expect(res.status).toBe(200);
    // Here .at(-2) WAS right, because a literal segment follows the id.
    expect(mockGetEligibility.mock.calls[0][0]).toBe(CONTRACT_ID);
  });

  it('passes the contract id when submitting a review', async () => {
    mockGetEligibility.mockResolvedValue({
      canReview: true,
      reason: null,
      revieweeUserId: OTHER_REVIEW_ID,
      existingReview: null,
      counterpartHasReviewed: false,
      editable: false,
    });
    mockCreateReview.mockResolvedValue({
      id: REVIEW_ID,
      contract_id: CONTRACT_ID,
      reviewee_user_id: OTHER_REVIEW_ID,
      rating_overall: 5,
      rating_communication: 5,
      rating_quality: 5,
      rating_timeliness: 5,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const req = new NextRequest(`http://localhost/api/contracts/${CONTRACT_ID}/review`, {
      method: 'POST',
      body: JSON.stringify({
        rating_overall: 5,
        rating_communication: 5,
        rating_quality: 5,
        rating_timeliness: 5,
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST_CONTRACT_REVIEW(req);
    expect(res.status).toBe(201);
    expect(mockCreateReview.mock.calls[0][0]).toBe(CONTRACT_ID);
  });

  it('refuses a review body that tries to name the reviewee', async () => {
    mockGetEligibility.mockClear();
    const req = new NextRequest(`http://localhost/api/contracts/${CONTRACT_ID}/review`, {
      method: 'POST',
      body: JSON.stringify({
        rating_overall: 5,
        rating_communication: 5,
        rating_quality: 5,
        rating_timeliness: 5,
        reviewee_user_id: OTHER_REVIEW_ID,
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST_CONTRACT_REVIEW(req);
    expect(res.status).toBe(400);
    expect(mockCreateReview).not.toHaveBeenCalled();
  });
});
