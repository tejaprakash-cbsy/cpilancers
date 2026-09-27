/**
 * Review service — Stage 11.
 *
 * Bidirectional reputation for completed contracts: the client can review the
 * consultant and the consultant can review the client.
 *
 * The rules from the brief are enforced twice on purpose.
 *
 *   Rule 1 (only parties may review)   trigger `enforce_review_integrity`
 *   Rule 3 (needs a completed contract) trigger + service
 *   Rule 4 (not arbitrarily editable)   trigger time window + service authorship
 *   Rule 5 (no self-review)            DB CHECK + trigger + service
 *   Rule 6 (no duplicates)             partial unique index + service
 *   Rule 7 (no unauthorized deletion)  service + audit row
 *
 * The service talks to the database with the service role, which bypasses RLS,
 * so a service-layer check alone would be the only thing standing between a
 * fabricated review and a reputation. The trigger is the real guard; the checks
 * here exist to produce a clear error instead of an opaque PostgREST violation.
 *
 * Nothing in this file ever writes a rating aggregate. Reputation is always
 * recomputed from the reviews table by `refresh_reputation`, so no sequence of
 * API calls can produce a number that the underlying reviews do not support.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseService } from './base.service';
import type { Review, Reputation, UserRole } from '@/types/database';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/lib/errors';
import {
  REVIEWABLE_CONTRACT_STATUS,
  REVIEW_BLOCK_MESSAGES,
  reviewEditWindowMs,
  type ReviewBlockReason,
} from '@/lib/validations/review.schemas';
import type { ReputationSummary } from '@/lib/reviews/reputation';
import {
  computeBayesianRating,
  MIN_REVIEWS_FOR_RANKING,
} from '@/lib/reviews/reputation';
import { NotificationService } from '@/services/notification.service';
import { reviewSubmitted } from '@/lib/notifications/events';

type ContractParty = {
  clientUserId: string | null;
  consultantUserId: string | null;
  clientRole: UserRole;
  consultantRole: UserRole;
  status: string;
};

export interface ReviewEligibility {
  canReview: boolean;
  reason: ReviewBlockReason | null;
  /** The party whose review the caller is about to write, if any. */
  revieweeUserId: string | null;
  /** The caller's existing review on this contract, if written. */
  existingReview: Review | null;
  /** True when the counterpart has already left their review. */
  counterpartHasReviewed: boolean;
  /** False once REVIEW_EDIT_WINDOW_DAYS has elapsed. */
  editable: boolean;
}

export class ReviewService extends BaseService {
  // -------------------------------------------------------------------------
  // Contract party resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve the two authenticated users behind a contract's profile ids.
   *
   * Everything downstream keys off user ids rather than profile ids so that a
   * review identifies a person, which is what a reputation has to be attached
   * to across every contract they take part in.
   */
  private static async contractParty(contractId: string): Promise<ContractParty> {
    const { data: contract, error } = await createAdminClient()
      .from('contracts')
      .select('id, status, client_id, consultant_id')
      .eq('id', contractId)
      .single();
    if (error || !contract) throw new NotFoundError('Contract');

    const db = createAdminClient();
    const [{ data: client }, { data: consultant }] = await Promise.all([
      db.from('client_profiles').select('user_id').eq('id', contract.client_id).single(),
      db
        .from('consultant_profiles')
        .select('user_id')
        .eq('id', contract.consultant_id)
        .single(),
    ]);

    return {
      clientUserId: client?.user_id ?? null,
      consultantUserId: consultant?.user_id ?? null,
      clientRole: 'client',
      consultantRole: 'consultant',
      status: contract.status,
    };
  }

  // -------------------------------------------------------------------------
  // Eligibility
  // -------------------------------------------------------------------------

  /**
   * Work out whether the caller may review, and why not if they may not.
   *
   * Exposed as a read so the UI can show "reviews open on 1 March" instead of
   * letting someone compose a review that will be rejected on submit.
   */
  static async getEligibility(contractId: string, userId: string): Promise<ReviewEligibility> {
    const party = await this.contractParty(contractId);
    const db = createAdminClient();

    const block = (reason: ReviewBlockReason): ReviewEligibility => ({
      canReview: false,
      reason,
      revieweeUserId: null,
      existingReview: null,
      counterpartHasReviewed: false,
      editable: false,
    });

    // Rule 1: only the two parties on the contract. A self-review is not
    // separately checkable here because the reviewee is derived below as the
    // caller's counterpart, so it is structurally impossible for a caller to
    // review themselves; the `self_review` reason stays reserved for the case
    // where a contract somehow lists the same user on both sides, which the
    // database trigger rejects outright.
    if (userId !== party.clientUserId && userId !== party.consultantUserId) {
      return block('not_a_participant');
    }

    // Rule 3: a review needs a genuinely completed contract.
    if (party.status !== REVIEWABLE_CONTRACT_STATUS) {
      return block('contract_not_completed');
    }

    const revieweeUserId =
      userId === party.clientUserId ? party.consultantUserId : party.clientUserId;
    if (!revieweeUserId) return block('counterpart_reviewee_missing');

    const { data: reviews } = await db
      .from('reviews')
      .select('*')
      .eq('contract_id', contractId)
      .is('deleted_at', null);

    const live = (reviews || []) as Review[];
    const mine = live.find((r) => r.reviewer_user_id === userId) ?? null;
    const counterpart = live.find((r) => r.reviewer_user_id !== userId) ?? null;

    // Rule 6: one review per party per contract.
    if (mine) {
      return {
        canReview: false,
        reason: 'already_reviewed',
        revieweeUserId,
        existingReview: mine,
        counterpartHasReviewed: Boolean(counterpart),
        editable: this.isWithinEditWindow(mine),
      };
    }

    return {
      canReview: true,
      reason: null,
      revieweeUserId,
      existingReview: null,
      counterpartHasReviewed: Boolean(counterpart),
      editable: false,
    };
  }

  private static isWithinEditWindow(review: Review): boolean {
    const age = Date.now() - new Date(review.created_at).getTime();
    return Number.isFinite(age) && age < reviewEditWindowMs;
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Leave a review on a completed contract.
   *
   * Takes the contract id and the ratings. There is no reviewee parameter: the
   * party being reviewed is the caller's counterpart on that contract, resolved
   * server-side, so a client cannot aim a review at a third party.
   *
   * The reviewer is likewise the authenticated caller. Nothing in the body can
   * influence who is credited as the author of this review.
   */
  static async createReview(
    contractId: string,
    reviewerUserId: string,
    input: {
      rating_overall: number;
      rating_communication: number;
      rating_quality: number;
      rating_timeliness: number;
      feedback_markdown?: string;
      is_public?: boolean;
    }
  ): Promise<Review> {
    const eligibility = await this.getEligibility(contractId, reviewerUserId);

    if (!eligibility.canReview) {
      const reason = eligibility.reason;
      if (reason === 'contract_not_completed' || reason === 'already_reviewed') {
        throw new ConflictError(REVIEW_BLOCK_MESSAGES[reason]);
      }
      throw new ForbiddenError(REVIEW_BLOCK_MESSAGES[reason ?? 'not_a_participant']);
    }
    if (!eligibility.revieweeUserId) {
      throw new AppError(
        REVIEW_BLOCK_MESSAGES.counterpart_reviewee_missing,
        409,
        'REVIEW_COUNTERPART_UNRESOLVED'
      );
    }

    const party = await this.contractParty(contractId);
    const reviewerRole: UserRole =
      reviewerUserId === party.clientUserId ? party.clientRole : party.consultantRole;

    const db = createAdminClient();
    const { data: review, error } = await db
      .from('reviews')
      .insert({
        contract_id: contractId,
        reviewer_user_id: reviewerUserId,
        reviewee_user_id: eligibility.revieweeUserId,
        reviewer_role: reviewerRole,
        rating_overall: input.rating_overall,
        rating_communication: input.rating_communication,
        rating_quality: input.rating_quality,
        rating_timeliness: input.rating_timeliness,
        feedback_markdown: input.feedback_markdown?.trim() || null,
        is_public: input.is_public ?? true,
      })
      .select('*')
      .single();

    if (error || !review) {
      // The unique index fires for a concurrent double-submit. Translate it into
      // the same message the pre-flight check would have produced, so a race
      // looks identical to a duplicate rather than leaking a database error.
      if (this.isUniqueViolation(error)) {
        throw new ConflictError(REVIEW_BLOCK_MESSAGES.already_reviewed);
      }
      // The trigger raises check_violation / insufficient_privilege. Surface the
      // rule rather than the raw database message.
      if (this.isRuleViolation(error)) {
        throw new ConflictError(REVIEW_BLOCK_MESSAGES.contract_not_completed);
      }
      throw new AppError('Failed to save the review.', 500, 'REVIEW_INSERT_ERROR', error);
    }

    await this.writeAudit(review.id, reviewerUserId, 'created', null, snapshot(review));
    // Reputation is NOT refreshed here. The AFTER INSERT trigger
    // `trg_reviews_refresh_reputation` (migration 00010) already calls
    // `refresh_reputation` inside this same transaction, so the aggregate is
    // correct by the time this statement commits. Calling it again was paying
    // for a second full recompute of every review the reviewee has.
    await this.notifyReviewee(
      eligibility.revieweeUserId,
      reviewerUserId,
      review,
      contractId
    );

    return review as Review;
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Public reviews for a user, newest first.
   *
   * Only live, public reviews are returned. Soft-deleted rows are excluded
   * entirely: this is a public listing, and a withdrawn review must disappear
   * from it as completely as it disappears from the aggregate. A reviewer who
   * needs to see their own withdrawn review is served by the contract review
   * endpoint, which resolves the caller's own row server-side.
   */
  static async listReviews(
    revieweeUserId: string,
    filters: {
      min_rating?: number;
      sortBy?: 'created_at' | 'rating_overall';
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ reviews: Review[]; total: number }> {
    const db = createAdminClient();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;

    let query = db
      .from('reviews')
      .select('*', { count: 'exact' })
      .eq('reviewee_user_id', revieweeUserId)
      .eq('is_public', true)
      .is('deleted_at', null);

    if (filters.min_rating) query = query.gte('rating_overall', filters.min_rating);

    const { data, error, count } = await query
      .order(filters.sortBy ?? 'created_at', { ascending: (filters.sortOrder ?? 'desc') === 'asc' })
      .range(from, from + limit - 1);

    if (error) throw new AppError('Failed to fetch reviews.', 500, 'REVIEW_FETCH_ERROR', error);
    return { reviews: (data || []) as Review[], total: count ?? 0 };
  }

  /**
   * The display model: average rating, review count, rating distribution and
   * completed projects.
   *
   * Read from the `reputation` table, which is written only by
   * `refresh_reputation` from the reviews themselves. If that row is missing the
   * aggregate is computed live rather than returning zeros, so a participant
   * never appears to have "0.00 from 0 reviews" purely because the trigger has
   * not fired yet.
   */
  static async getReputation(userId: string): Promise<ReputationSummary> {
    const db = createAdminClient();
    const { data, error } = await db
      .from('reputation')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // A failed query must never be reported as a participant with no reviews.
    // Distinguishing the two is the whole point: a genuine "no row yet" falls
    // through to the live aggregate below, while a transport or parse failure is
    // surfaced. Collapsing them is what previously turned a bad user id into an
    // HTTP 200 full of zeros.
    if (error) {
      throw new AppError(
        'Failed to load reputation.',
        500,
        'REPUTATION_FETCH_ERROR',
        error
      );
    }

    if (data) {
      return toSummary(data as Reputation);
    }

    // Fallback: aggregate directly. Slower, but always truthful, and now only
    // reached when the aggregate row genuinely does not exist.
    const reviews = await this.livePublicReviews(userId);
    const completed = await this.completedContractCount(userId);
    return summarizeFallback(reviews, completed);
  }

  private static async livePublicReviews(userId: string): Promise<Review[]> {
    const { data, error } = await createAdminClient()
      .from('reviews')
      .select('*')
      .eq('reviewee_user_id', userId)
      .eq('is_public', true)
      .is('deleted_at', null);

    if (error) {
      throw new AppError('Failed to load reviews.', 500, 'REVIEW_FETCH_ERROR', error);
    }
    return (data || []) as Review[];
  }

  private static async completedContractCount(userId: string): Promise<number> {
    const db = createAdminClient();
    const [{ data: client }, { data: consultant }] = await Promise.all([
      db.from('client_profiles').select('id').eq('user_id', userId).maybeSingle(),
      db.from('consultant_profiles').select('id').eq('user_id', userId).maybeSingle(),
    ]);

    if (!client && !consultant) return 0;

    const { count, error } = await db
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('status', REVIEWABLE_CONTRACT_STATUS)
      .or(
        [
          client ? `client_id.eq.${client.id}` : null,
          consultant ? `consultant_id.eq.${consultant.id}` : null,
        ]
          .filter(Boolean)
          .join(',')
      );

    if (error) {
      throw new AppError('Failed to count completed contracts.', 500, 'CONTRACT_COUNT_ERROR', error);
    }

    return count ?? 0;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  /**
   * Amend a review.
   *
   * Rule 4: bounded, authorised and audited.
   *   - only the author may change their own review;
   *   - only within the edit window, after which the trigger refuses the write;
   *   - the complete before and after state is recorded, so a rating that is
   *     quietly raised months later is visible in the audit trail even when the
   *     window has closed and legitimate changes are refused.
   */
  static async updateReview(
    reviewId: string,
    userId: string,
    input: {
      rating_overall?: number;
      rating_communication?: number;
      rating_quality?: number;
      rating_timeliness?: number;
      feedback_markdown?: string;
      is_public?: boolean;
    }
  ): Promise<Review> {
    const db = createAdminClient();
    const { data: existing, error: fetchError } = await db
      .from('reviews')
      .select('*')
      .eq('id', reviewId)
      .single();
    if (fetchError || !existing) throw new NotFoundError('Review');

    const review = existing as Review;

    if (review.deleted_at) {
      throw new ConflictError(REVIEW_BLOCK_MESSAGES.review_already_deleted);
    }

    // Rule 7's author check: authorship is not negotiable.
    if (review.reviewer_user_id !== userId) {
      throw new ForbiddenError('Only the author of a review can change it.');
    }

    if (!this.isWithinEditWindow(review)) {
      throw new ForbiddenError(REVIEW_BLOCK_MESSAGES.edit_window_closed);
    }

    const before = snapshot(review);

    const patch: Record<string, unknown> = {};
    if (input.rating_overall !== undefined) patch.rating_overall = input.rating_overall;
    if (input.rating_communication !== undefined) {
      patch.rating_communication = input.rating_communication;
    }
    if (input.rating_quality !== undefined) patch.rating_quality = input.rating_quality;
    if (input.rating_timeliness !== undefined) patch.rating_timeliness = input.rating_timeliness;
    if (input.feedback_markdown !== undefined) {
      patch.feedback_markdown = input.feedback_markdown.trim() || null;
    }
    if (input.is_public !== undefined) patch.is_public = input.is_public;

    patch.edit_count = review.edit_count + 1;
    patch.edited_at = new Date().toISOString();

    const { data: updated, error } = await db
      .from('reviews')
      .update(patch)
      .eq('id', reviewId)
      .eq('reviewer_user_id', userId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !updated) {
      if (this.isRuleViolation(error)) {
        throw new ForbiddenError(REVIEW_BLOCK_MESSAGES.edit_window_closed);
      }
      throw new AppError('Failed to update the review.', 500, 'REVIEW_UPDATE_ERROR', error);
    }

    const after = snapshot(updated as Review);
    await this.writeAudit(reviewId, userId, 'edited', before, after);
    // Refreshed by the AFTER UPDATE trigger, in-transaction. See createReview.

    return updated as Review;
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  /**
   * Delete a review.
   *
   * Rule 7: the author may withdraw their own review, but only inside the edit
   * window, so a settled rating cannot be pulled out of the record after the
   * fact. A platform administrator may remove a review at any time, for abuse or
   * confidentiality, and that is always audited.
   *
   * The row is soft-deleted rather than removed. The ratings survive for dispute
   * resolution and the audit trail stays meaningful, while the aggregate excludes
   * it immediately.
   */
  static async deleteReview(
    reviewId: string,
    userId: string,
    isAdmin: boolean,
    reason: string
  ): Promise<{ deleted: true; review: Review }> {
    const db = createAdminClient();
    const { data: existing, error: fetchError } = await db
      .from('reviews')
      .select('*')
      .eq('id', reviewId)
      .single();
    if (fetchError || !existing) throw new NotFoundError('Review');

    const review = existing as Review;
    if (review.deleted_at) {
      throw new ConflictError(REVIEW_BLOCK_MESSAGES.review_already_deleted);
    }

    if (review.reviewer_user_id !== userId) {
      if (!isAdmin) {
        throw new ForbiddenError('Only the author of a review can delete it.');
      }
    } else if (!isAdmin && !this.isWithinEditWindow(review)) {
      // The author acting on their own review is bound by the window; an admin is
      // not, because an admin deletion is a moderation action with a recorded
      // reason rather than a quiet withdrawal of a settled rating.
      throw new ForbiddenError(REVIEW_BLOCK_MESSAGES.edit_window_closed);
    }

    const before = snapshot(review);
    const now = new Date().toISOString();

    const { data: deleted, error } = await db
      .from('reviews')
      .update({
        deleted_at: now,
        deleted_by_user_id: userId,
        deletion_reason: reason.trim().slice(0, 500),
      })
      .eq('id', reviewId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !deleted) {
      // Another deletion won the race, or the trigger refused a restore.
      throw new ConflictError(REVIEW_BLOCK_MESSAGES.review_already_deleted);
    }

    await this.writeAudit(reviewId, userId, 'deleted', before, null);
    // Refreshed by the AFTER UPDATE trigger, in-transaction. See createReview.

    return { deleted: true, review: deleted as Review };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Recompute the aggregate for a reviewee.
   *
   * Retained deliberately as a repair tool, but NOT called from the request path.
   * The `trg_reviews_refresh_reputation` trigger performs the same recompute
   * inside the transaction that writes the review, which is strictly better: it
   * makes it impossible to commit a review while the aggregate still reflects the
   * old state, and it cannot fail independently of the write. The previous code
   * called both, so every review write paid for two full recomputes of every
   * review the reviewee had.
   *
   * Because the trigger already guarantees the aggregate, this is only for
   * reconciling a drifted row (for example after a manual database edit) and is
   * intentionally reachable only from a service-role context.
   */
  static async refreshReputation(userId: string): Promise<void> {
    const { error } = await createAdminClient().rpc('refresh_reputation', {
      p_user_id: userId,
    });
    if (error) {
      throw new AppError('Failed to refresh reputation.', 500, 'REPUTATION_REFRESH_ERROR', error);
    }
  }

  private static async writeAudit(
    reviewId: string,
    editorUserId: string,
    action: 'created' | 'edited' | 'deleted',
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null
  ): Promise<void> {
    try {
      await createAdminClient().from('review_edits').insert({
        review_id: reviewId,
        editor_user_id: editorUserId,
        action,
        before_state: before,
        after_state: after,
      });
    } catch (error) {
      // The audit insert can fail on its own constraints. Surfaced loudly
      // because an unaudited change to a rating is exactly what rules 4 and 7
      // exist to prevent.
      console.error('[reviews] failed to write review audit row', {
        reviewId,
        action,
        error,
      });
    }
  }

  private static async notifyReviewee(
    revieweeUserId: string,
    reviewerUserId: string,
    review: Review,
    contractId: string
  ): Promise<void> {
    try {
      const { data: reviewer } = await createAdminClient()
        .from('profiles')
        .select('display_name')
        .eq('user_id', reviewerUserId)
        .maybeSingle();

      // Routed through NotificationService so the notification is deduplicated on
      // the review id, respects the recipient's channel preferences, and lands in
      // the delivery ledger. A direct insert here would bypass all three.
      await reviewSubmitted(NotificationService.emitEvent, {
        recipientUserId: revieweeUserId,
        actorUserId: reviewerUserId,
        actorName: reviewer?.display_name ?? null,
        reviewId: review.id,
        rating: review.rating_overall,
        contractId,
      });
    } catch (error) {
      // A notification failure must never roll back a financial or reputation
      // transition, so this is logged and swallowed.
      console.error('[reviews] failed to notify reviewee:', error);
    }
  }

  private static isUniqueViolation(error: { code?: string } | null): boolean {
    return error?.code === '23505';
  }

  private static isRuleViolation(error: { code?: string } | null): boolean {
    return error?.code === '23514' || error?.code === '42501';
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * The review fields worth auditing. `contract_id`, the parties and the role are
 * deliberately excluded: the trigger makes them immutable, so a change there is
 * impossible rather than merely disallowed.
 */
function snapshot(review: Review): Record<string, unknown> {
  return {
    rating_overall: review.rating_overall,
    rating_communication: review.rating_communication,
    rating_quality: review.rating_quality,
    rating_timeliness: review.rating_timeliness,
    feedback_markdown: review.feedback_markdown,
    is_public: review.is_public,
    edit_count: review.edit_count,
  };
}

function toSummary(reputation: Reputation): ReputationSummary {
  const distribution = reputation.rating_distribution || {};
  return {
    average_rating: Number(reputation.avg_rating_overall),
    total_reviews: reputation.total_reviews_count,
    completed_projects: reputation.completed_contracts_count,
    rating_distribution: {
      1: Number(distribution['1'] ?? 0),
      2: Number(distribution['2'] ?? 0),
      3: Number(distribution['3'] ?? 0),
      4: Number(distribution['4'] ?? 0),
      5: Number(distribution['5'] ?? 0),
    },
    dimension_averages: {
      overall: Number(reputation.avg_rating_overall),
      communication: Number(reputation.avg_rating_communication),
      quality: Number(reputation.avg_rating_quality),
      timeliness: Number(reputation.avg_rating_timeliness),
    },
    ranking_score: Number(reputation.bayesian_rating),
    has_public_reviews: reputation.total_reviews_count > 0,
    is_proven: reputation.total_reviews_count >= MIN_REVIEWS_FOR_RANKING,
  };
}

function summarizeFallback(reviews: Review[], completedProjects: number): ReputationSummary {
  const total = reviews.length;
  const avg = (pick: (r: Review) => number) =>
    total === 0 ? 0 : Math.round((reviews.reduce((a, r) => a + pick(r), 0) / total) * 100) / 100;

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    if (review.rating_overall >= 1 && review.rating_overall <= 5) {
      distribution[review.rating_overall as keyof typeof distribution] += 1;
    }
  }

  return {
    average_rating: avg((r) => r.rating_overall),
    total_reviews: total,
    completed_projects: completedProjects,
    rating_distribution: distribution,
    dimension_averages: {
      overall: avg((r) => r.rating_overall),
      communication: avg((r) => r.rating_communication),
      quality: avg((r) => r.rating_quality),
      timeliness: avg((r) => r.rating_timeliness),
    },
    // Delegated to the shared implementation rather than repeating the prior
    // constants, so this fallback cannot drift from `refresh_reputation`.
    ranking_score: computeBayesianRating(
      reviews.reduce((acc, r) => acc + r.rating_overall, 0),
      total
    ),
    has_public_reviews: total > 0,
    is_proven: total >= MIN_REVIEWS_FOR_RANKING,
  };
}
