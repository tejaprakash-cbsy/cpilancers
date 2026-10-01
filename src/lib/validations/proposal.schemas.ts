/**
 * Proposal Form Validation Schemas
 * Using Zod for type-safe validation
 */

import { z } from 'zod';

// Proposal status enum (mirrors DB proposal_status enum)
export const proposalStatusEnum = z.enum([
  'draft',
  'submitted',
  'shortlisted',
  'rejected',
  'withdrawn',
  'accepted',
]);

export type ProposalStatus = z.infer<typeof proposalStatusEnum>;

// Valid state transitions for the proposal state machine:
// DRAFT → SUBMITTED
// SUBMITTED → SHORTLISTED | REJECTED | WITHDRAWN
// SHORTLISTED → ACCEPTED | REJECTED | WITHDRAWN
// ACCEPTED → (terminal)
// REJECTED → (terminal)
// WITHDRAWN → (terminal)
export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['shortlisted', 'rejected', 'withdrawn'],
  shortlisted: ['accepted', 'rejected', 'withdrawn'],
  accepted: [],
  rejected: [],
  withdrawn: [],
};

// Who can make each transition
// 'consultant' = the proposal's author
// 'client'     = the job's owner
export const TRANSITION_ACTOR: Record<string, 'consultant' | 'client' | 'both'> = {
  // consultant submits / withdraws their own draft
  'draft→submitted': 'consultant',
  'draft→withdrawn': 'consultant',
  // client shortlists, rejects; consultant may also withdraw after submission
  'submitted→shortlisted': 'client',
  'submitted→rejected': 'client',
  'submitted→withdrawn': 'consultant',
  // client accepts / rejects shortlisted; consultant may still withdraw
  'shortlisted→accepted': 'client',
  'shortlisted→rejected': 'client',
  'shortlisted→withdrawn': 'consultant',
};

/**
 * Schema for submitting a new proposal (consultant → POST /api/proposals)
 */
export const proposalCreateSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),

  cover_letter_markdown: z
    .string()
    .min(100, 'Cover letter must be at least 100 characters')
    .max(5000, 'Cover letter must be less than 5,000 characters'),

  technical_solution_markdown: z
    .string()
    .min(50, 'Technical solution must be at least 50 characters')
    .max(5000, 'Technical solution must be less than 5,000 characters'),

  proposed_duration_weeks: z
    .number()
    .int()
    .min(1, 'Proposed duration must be at least 1 week')
    .max(52, 'Proposed duration cannot exceed 52 weeks'),

  // Stored in cents (e.g. 150000 = $1,500.00)
  proposed_price_cents: z
    .number()
    .int()
    .min(100, 'Proposed price must be at least $1.00')
    .max(100_000_00, 'Proposed price cannot exceed $1,000,000.00'),

  proposed_milestones: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        due_weeks: z.number().int().min(1).max(52),
        amount_cents: z.number().int().min(0),
      })
    )
    .default([]),

  // Save as draft instead of immediately submitting
  save_as_draft: z.boolean().default(false),
});

export type ProposalCreateFormData = z.infer<typeof proposalCreateSchema>;

/**
 * Schema for updating an existing proposal (consultant → PATCH /api/proposals/[id])
 * Only editable while status === 'draft'
 *
 * `proposed_milestones` is re-declared without its `.default([])`.
 * `proposalCreateSchema` defaults the field so `POST` can omit it, but that
 * default survives `.partial()`: `.partial()` only makes the key optional, it
 * does not remove the default, so `parse({})` still produced
 * `{ proposed_milestones: [] }`. `PATCH` then always had at least one key,
 * making the route's "no editable fields" guard unreachable, and an empty body
 * silently wiped every milestone on the proposal. Absent must mean absent here.
 */
export const proposalUpdateSchema = proposalCreateSchema
  .pick({
    cover_letter_markdown: true,
    technical_solution_markdown: true,
    proposed_duration_weeks: true,
    proposed_price_cents: true,
    proposed_milestones: true,
  })
  .partial()
  .extend({
    proposed_milestones: z
      .array(
        z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(1000).optional(),
          due_weeks: z.number().int().min(1).max(52),
          amount_cents: z.number().int().min(0),
        })
      )
      .optional(),
  });

export type ProposalUpdateFormData = z.infer<typeof proposalUpdateSchema>;

/**
 * Schema for transitioning a proposal's status
 * Used by both consultant (withdraw) and client (shortlist / accept / reject)
 */
export const proposalStatusUpdateSchema = z.object({
  status: proposalStatusEnum,
  // Optional note for rejections or acceptances
  note: z.string().max(1000).optional(),
});

export type ProposalStatusUpdateFormData = z.infer<typeof proposalStatusUpdateSchema>;

/**
 * Schema for filtering the proposal list (client and consultant views)
 */
export const proposalFilterSchema = z.object({
  job_id: z.string().uuid().optional(),
  status: z.array(proposalStatusEnum).optional(),
  sortBy: z
    .enum(['submitted_at', 'proposed_price_cents', 'proposed_duration_weeks'])
    .optional()
    .default('submitted_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
});

export type ProposalFilterFormData = z.infer<typeof proposalFilterSchema>;
