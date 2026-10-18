/**
 * Administrator dashboard validation schemas and state machines — Stage 13.
 *
 * Everything here is pure. Authorization itself is NOT decided here: the
 * administrator's role is read from the database in AdminService, because a
 * check that can be expressed in a request body, a query parameter or a header
 * is not an authorization check. These schemas validate *input* and constrain
 * *state transitions*, so the rules are testable without a database and so the
 * service has no decisions left to make ad hoc.
 *
 * Two rules are enforced here that are easy to get wrong and expensive to get
 * wrong:
 *
 *   1. An administrator cannot moderate themselves. A compromised or careless
 *      operator must not be able to suspend, ban or demote their own account,
 *      because that either locks the platform out of its own admin surface or
 *      hides the very action an investigator would be looking for.
 *
 *   2. Moderation transitions are one-way except for an explicit reversal. A
 *      removed job does not silently become visible again because a flag was
 *      cleared; going back requires a deliberate act.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Roles and moderation vocabulary
// ---------------------------------------------------------------------------

/** Roles that may act in the dashboard. Mirrors the `user_role` enum. */
export const ADMIN_ROLE = 'admin';

/** Account states an administrator can move a user into. */
export const ADMIN_USER_STATUSES = ['active', 'suspended', 'deactivated'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

/** A user account is banned when it is deactivated. Banning is terminal in the
 *  sense that it is not a state any other feature writes, so restoring one is a
 *  deliberate administrative act rather than a side effect. */
export const USER_STATUS_BANNED: AdminUserStatus = 'deactivated';

/** Moderation states a job can be in. Mirrors `jobs.moderation_status`. */
export const JOB_MODERATION_STATUSES = ['none', 'flagged', 'removed'] as const;
export type JobModerationStatus = (typeof JOB_MODERATION_STATUSES)[number];

/** Coarse groupings used to filter the audit log. */
export const ADMIN_AUDIT_CATEGORIES = [
  'user',
  'job',
  'proposal',
  'payment',
  'dispute',
  'report',
  'auth',
] as const;
export type AdminAuditCategory = (typeof ADMIN_AUDIT_CATEGORIES)[number];

/** Report dispositions. Mirrors the `report_status` enum. */
export const REPORT_STATUSES = [
  'pending',
  'investigating',
  'action_taken',
  'dismissed',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Dispute states. Mirrors the `dispute_status` enum. */
export const DISPUTE_STATUSES = [
  'open',
  'under_review',
  'resolved_refund_client',
  'resolved_payout_consultant',
  'resolved_split',
  'dismissed',
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------

/**
 * Whether a role may enter the administrator surface at all.
 *
 * This is deliberately a pure predicate over an already-resolved role, so the
 * rule "only admins" is unit-testable. The role itself is never supplied by a
 * caller: AdminService reads it from the caller's `public.users` row.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE;
}

/**
 * Whether `actorId` may moderate `targetId`.
 *
 * Self-moderation is refused unconditionally. This is a rule about the operator,
 * not about the target, so it applies to every moderation action in the service.
 */
export function canModerate(actorId: string, targetId: string): boolean {
  return actorId !== targetId;
}

// ---------------------------------------------------------------------------
// Job moderation state machine
// ---------------------------------------------------------------------------

/**
 * Allowed moderation transitions.
 *
 *   none     -> flagged     an operator marked it for review
 *   flagged  -> removed     the review concluded and the job was pulled
 *   flagged  -> none        the review cleared it
 *   removed  -> none        an explicit restore, deliberately a separate act
 *
 * `none -> removed` is allowed so an obviously abusive job can be pulled
 * immediately without first being flagged.
 */
export const JOB_MODERATION_TRANSITIONS: Record<JobModerationStatus, JobModerationStatus[]> = {
  none: ['flagged', 'removed'],
  flagged: ['removed', 'none'],
  removed: ['none'],
};

export function isValidJobModerationTransition(
  from: JobModerationStatus,
  to: JobModerationStatus
): boolean {
  const allowed = JOB_MODERATION_TRANSITIONS[from];
  return Array.isArray(allowed) ? allowed.includes(to) : false;
}

// ---------------------------------------------------------------------------
// User status state machine
// ---------------------------------------------------------------------------

/**
 * Allowed account status transitions.
 *
 *   active     -> suspended    a moderator acted
 *   suspended  -> active       the moderation was lifted
 *   suspended  -> deactivated  a ban, which ends the account
 *   active     -> deactivated  a ban without a prior suspension
 *
 * `deactivated` is terminal. Restoring a banned account is a deliberate
 * administrative act with its own audit entry, not something that happens
 * because a suspension was lifted: a ban is a stronger statement than a
 * suspension, and silently undoing one because an unrelated flag changed would
 * undo the reason it was applied.
 */
export const USER_STATUS_TRANSITIONS: Record<AdminUserStatus, AdminUserStatus[]> = {
  active: ['suspended', 'deactivated'],
  suspended: ['active', 'deactivated'],
  deactivated: [],
};

export function isValidUserStatusTransition(
  from: AdminUserStatus,
  to: AdminUserStatus
): boolean {
  const allowed = USER_STATUS_TRANSITIONS[from];
  return Array.isArray(allowed) ? allowed.includes(to) : false;
}

/** Flagging or removing a job must always carry a stated reason. */
export function requiresModerationReason(to: JobModerationStatus): boolean {
  return to === 'removed' || to === 'flagged';
}

// ---------------------------------------------------------------------------
// Dispute state machine
// ---------------------------------------------------------------------------

/**
 * Allowed dispute transitions. Terminal states are terminal: a resolved or
 * dismissed dispute cannot be reopened, because reopening it would move real
 * money back into an unresolved state with no record of who decided that was a
 * good idea.
 */
export const DISPUTE_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  open: [
    'under_review',
    'resolved_refund_client',
    'resolved_payout_consultant',
    'resolved_split',
    'dismissed',
  ],
  under_review: [
    'resolved_refund_client',
    'resolved_payout_consultant',
    'resolved_split',
    'dismissed',
  ],
  resolved_refund_client: [],
  resolved_payout_consultant: [],
  resolved_split: [],
  dismissed: [],
};

export function isValidDisputeTransition(from: DisputeStatus, to: DisputeStatus): boolean {
  return DISPUTE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** A dispute that ends in a money movement must record what was decided. */
export function requiresResolutionSummary(to: DisputeStatus): boolean {
  return to !== 'open' && to !== 'under_review';
}

// ---------------------------------------------------------------------------
// Report state machine
// ---------------------------------------------------------------------------

export const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  pending: ['investigating', 'action_taken', 'dismissed'],
  investigating: ['action_taken', 'dismissed'],
  // `action_taken` and `dismissed` are terminal. Reopening a report that was
  // already acted on would invite acting on the same report twice.
  action_taken: [],
  dismissed: [],
};

export function isValidReportTransition(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_TRANSITIONS[from]?.includes(to) ?? false;
}


// ---------------------------------------------------------------------------
// Request schemas
//
// Every schema is `.strict()`. The important part is not that unknown keys are
// rejected, it is that a key like `admin_user_id` or `role` is rejected: an
// administrator's identity comes from the session, so a body that carries one is
// either a bug or an attempt, and both deserve a loud failure rather than being
// silently ignored.
// ---------------------------------------------------------------------------

/** Pagination for every admin list. Bounded so a dashboard cannot be used to
 *  pull an entire table in one request. */
export const adminPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Dynamic admin resources use the repository's installed Zod UUID validator. */
export const adminResourceIdSchema = z.uuid({ error: 'Invalid resource ID.' });

/** Search across users. Matched case-insensitively on email. */
export const adminUserSearchSchema = adminPaginationSchema.extend({
  query: z.string().trim().min(1).max(200).optional(),
  role: z.enum(['client', 'consultant', 'admin']).optional(),
  status: z.enum(ADMIN_USER_STATUSES).optional(),
});

/** Search across jobs. */
export const adminJobSearchSchema = adminPaginationSchema.extend({
  query: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().max(40).optional(),
  moderationStatus: z.enum(JOB_MODERATION_STATUSES).optional(),
});

/** Search across proposals. */
export const adminProposalSearchSchema = adminPaginationSchema.extend({
  query: z.string().trim().min(1).max(200).optional(),
  jobId: z.string().uuid('Invalid job id').optional(),
  status: z.string().trim().max(40).optional(),
});

/** Payment, refund and payout listings. */
export const adminPaymentFilterSchema = adminPaginationSchema.extend({
  status: z.string().trim().max(40).optional(),
  contractId: z.string().uuid('Invalid contract id').optional(),
});

export const adminPayoutFilterSchema = adminPaginationSchema.extend({
  status: z.string().trim().max(40).optional(),
});

/** Reports, filtered by the subject type the brief groups them under. */
export const adminReportFilterSchema = adminPaginationSchema.extend({
  targetType: z.enum(['user', 'job', 'proposal', 'review', 'message']).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
});

export const adminDisputeFilterSchema = adminPaginationSchema.extend({
  status: z.enum(DISPUTE_STATUSES).optional(),
});

/** Audit log filter. `category` is constrained to the known set so the log
 *  cannot be used to probe arbitrary text. */
export const adminAuditFilterSchema = adminPaginationSchema.extend({
  category: z.enum(ADMIN_AUDIT_CATEGORIES).optional(),
  adminUserId: z.string().uuid('Invalid admin id').optional(),
  targetType: z.string().trim().max(40).optional(),
  targetId: z.string().trim().max(64).optional(),
});

/**
 * Change a user's account status.
 *
 * There is no `userId` here: the id in the URL is the subject, and it is
 * resolved server-side. There is no `role` field either, because promoting an
 * account is not a status change and is deliberately not a dashboard action.
 */
export const adminUserModerationSchema = z
  .object({
    status: z.enum(ADMIN_USER_STATUSES),
    reason: z.string().trim().min(3, 'A reason is required for account changes.').max(500),
  })
  .strict();

/** Flag, unflag or remove a job. */
export const adminJobModerationSchema = z
  .object({
    moderationStatus: z.enum(JOB_MODERATION_STATUSES),
    reason: z.string().trim().min(3, 'A reason is required for moderation.').max(500),
  })
  .strict();

/** Move a dispute to a new state. */
export const adminDisputeUpdateSchema = z
  .object({
    status: z.enum(DISPUTE_STATUSES),
    resolutionSummary: z.string().trim().min(10, 'Describe how the dispute was resolved.').max(2000)
      .optional(),
  })
  .strict();

/** Move a report to a new state. */
export const adminReportUpdateSchema = z
  .object({
    status: z.enum(REPORT_STATUSES),
    actionTaken: z.string().trim().min(3, 'Describe the action taken.').max(1000),
  })
  .strict();

export type AdminUserSearchInput = z.infer<typeof adminUserSearchSchema>;
export type AdminJobSearchInput = z.infer<typeof adminJobSearchSchema>;
export type AdminProposalSearchInput = z.infer<typeof adminProposalSearchSchema>;
export type AdminPaymentFilterInput = z.infer<typeof adminPaymentFilterSchema>;
export type AdminPayoutFilterInput = z.infer<typeof adminPayoutFilterSchema>;
export type AdminReportFilterInput = z.infer<typeof adminReportFilterSchema>;
export type AdminDisputeFilterInput = z.infer<typeof adminDisputeFilterSchema>;
export type AdminAuditFilterInput = z.infer<typeof adminAuditFilterSchema>;
export type AdminUserModerationInput = z.infer<typeof adminUserModerationSchema>;
export type AdminJobModerationInput = z.infer<typeof adminJobModerationSchema>;
export type AdminDisputeUpdateInput = z.infer<typeof adminDisputeUpdateSchema>;
export type AdminReportUpdateInput = z.infer<typeof adminReportUpdateSchema>;

