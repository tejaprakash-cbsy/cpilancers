/**
 * Review validation schemas.
 *
 * Enforces the shape of a review at the boundary. The rules about *who* may
 * review, *when*, and *how often* cannot be expressed in Zod — they depend on
 * other rows — so they live in the `enforce_review_integrity` trigger in
 * migration 00010 and are re-checked in ReviewService. Duplicating the checks
 * here is intentional: the database is the authority, the service is the
 * user-facing explanation, and this file is the fast rejection.
 */

import { z } from 'zod';
import { RATING_MIN, RATING_MAX } from '@/lib/reviews/reputation';

/**
 * A review may be amended for this long after it is written. After that the
 * review is immutable, enforced by the database trigger. Seven days is long
 * enough to fix a typo or a rating entered against the wrong milestone, and
 * short enough that a profile cannot be reshaped once the outcome is settled.
 */
export const REVIEW_EDIT_WINDOW_DAYS = 7;

export const reviewEditWindowMs = REVIEW_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** A whole-star rating. Floats and out-of-range values are rejected here. */
const ratingSchema = z
  .number()
  .int('Ratings must be whole stars.')
  .min(RATING_MIN, `Ratings must be at least ${RATING_MIN}.`)
  .max(RATING_MAX, `Ratings must be at most ${RATING_MAX}.`);

export const reviewCreateSchema = z
  .object({
    rating_overall: ratingSchema,
    rating_communication: ratingSchema,
    rating_quality: ratingSchema,
    rating_timeliness: ratingSchema,
    feedback_markdown: z
      .string()
      .max(5000, 'Reviews are limited to 5000 characters.')
      .optional(),
    /**
     * Defaults to public. A marketplace where reviews default to hidden is not a
     * marketplace with a reputation system, and an undisclosed default would
     * quietly let ratings accumulate invisibly.
     */
    is_public: z.boolean().optional().default(true),
  })
  // No reviewee field. The party being reviewed is derived from the contract, so
  // a client cannot post a review aimed at a third party.
  // No reviewer field. The reviewer is the authenticated caller.
  // No contract_id field. It comes from the route.
  .strict();

export type ReviewCreateFormData = z.infer<typeof reviewCreateSchema>;

/**
 * Amend an existing review.
 *
 * The rating fields are all optional so a text-only correction is possible, but
 * at least one changeable field must be present — otherwise the request is a
 * no-op that would still burn an audit row.
 */
export const reviewUpdateSchema = z
  .object({
    rating_overall: ratingSchema.optional(),
    rating_communication: ratingSchema.optional(),
    rating_quality: ratingSchema.optional(),
    rating_timeliness: ratingSchema.optional(),
    feedback_markdown: z.string().max(5000).optional(),
    is_public: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.rating_overall !== undefined ||
      value.rating_communication !== undefined ||
      value.rating_quality !== undefined ||
      value.rating_timeliness !== undefined ||
      value.feedback_markdown !== undefined ||
      value.is_public !== undefined,
    { message: 'No changes were supplied.' }
  );

export type ReviewUpdateFormData = z.infer<typeof reviewUpdateSchema>;

export const reviewDeleteSchema = z
  .object({
    reason: z.string().min(3).max(500),
  })
  .strict();

export type ReviewDeleteFormData = z.infer<typeof reviewDeleteSchema>;

export const reviewFilterSchema = z.object({
  reviewee_user_id: z.string().uuid().optional(),
  contract_id: z.string().uuid().optional(),
  min_rating: z.number().int().min(RATING_MIN).max(RATING_MAX).optional(),
  /** Only reviews that would count toward the aggregate. Defaults to true. */
  live_only: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value !== 'false'),
  sortBy: z.enum(['created_at', 'rating_overall']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export type ReviewFilterFormData = z.infer<typeof reviewFilterSchema>;

/**
 * The contract status a review requires.
 *
 * Declared here so the service and any UI messaging cite the same value rather
 * than a hardcoded string drifting in two places.
 */
export const REVIEWABLE_CONTRACT_STATUS = 'completed' as const;

/** Why a review cannot be left right now. Drives a specific user-facing message. */
export type ReviewBlockReason =
  | 'contract_not_completed'
  | 'already_reviewed'
  | 'not_a_participant'
  | 'self_review'
  | 'counterpart_reviewee_missing'
  | 'edit_window_closed'
  | 'review_already_deleted';

export const REVIEW_BLOCK_MESSAGES: Record<ReviewBlockReason, string> = {
  contract_not_completed:
    'Reviews can only be left once the contract is completed.',
  already_reviewed: 'You have already reviewed the other party on this contract.',
  not_a_participant: 'Only the client or the consultant on this contract can review.',
  self_review: 'A user cannot review themselves.',
  counterpart_reviewee_missing:
    'The other party on this contract could not be resolved.',
  edit_window_closed: `Reviews can only be changed within ${REVIEW_EDIT_WINDOW_DAYS} days.`,
  review_already_deleted: 'This review has already been deleted.',
};
