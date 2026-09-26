/**
 * Contract & Milestone Validation Schemas
 * Using Zod for type-safe validation
 */

import { z } from 'zod';

// Contract status enum (mirrors DB contract_status enum)
export const contractStatusEnum = z.enum([
  'pending_acceptance',
  'active',
  'completed',
  'disputed',
  'cancelled',
  'terminated',
]);

export type ContractStatus = z.infer<typeof contractStatusEnum>;

// Milestone status enum (mirrors DB milestone_status enum)
export const milestoneStatusEnum = z.enum([
  'pending',
  'funded',
  'in_progress',
  'submitted',
  'approved',
  'disputed',
  'cancelled',
]);

export type MilestoneStatus = z.infer<typeof milestoneStatusEnum>;

// Payment structure
export const paymentStructureEnum = z.enum(['fixed_milestones', 'hourly_capped']);
export const contractTypeEnum = z.enum(['fixed_price', 'hourly']);

// Valid contract state transitions
// pending_acceptance → active (client accepts proposal)
// active → completed, cancelled, disputed, terminated
// pending_acceptance → cancelled, terminated (before start)
export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  pending_acceptance: ['active', 'cancelled', 'terminated'],
  active: ['completed', 'cancelled', 'disputed', 'terminated'],
  completed: [],
  disputed: ['completed', 'cancelled', 'terminated'],
  cancelled: [],
  terminated: [],
};

// Valid milestone state transitions
// pending → active, cancelled
// active → submitted, cancelled
// submitted → approved, revision_requested, cancelled
// revision_requested → submitted, cancelled
// approved/cancelled are terminal
export const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  pending: ['funded', 'cancelled'],
  funded: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'disputed', 'cancelled'],
  submitted: ['approved', 'disputed', 'cancelled'],
  approved: [],
  disputed: ['submitted', 'approved', 'cancelled'],
  cancelled: [],
};

export function getMilestoneTransitionActor(
  from: MilestoneStatus,
  to: MilestoneStatus
): 'client' | 'consultant' | 'both' | null {
  // Client can approve/reject
  if (to === 'approved') return 'client';
  if (to === 'disputed') return 'both';
  // Consultant can submit
  if (to === 'submitted') return 'consultant';
  // Both can cancel
  if (to === 'cancelled') return 'both';
  // Funding is a client-side action; work starts with the consultant.
  if (to === 'funded') return 'client';
  if (to === 'in_progress') return 'consultant';
  return null;
}

/**
 * Schema for creating a new contract (client accepts a proposal)
 */
export const contractCreateSchema = z.object({
  proposal_id: z.string().uuid('Invalid proposal ID'),
  title: z
    .string()
    .min(3, 'Contract title must be at least 3 characters')
    .max(200, 'Contract title must be less than 200 characters'),
  terms_markdown: z
    .string()
    .min(50, 'Terms must be at least 50 characters')
    .max(5000, 'Terms must be less than 5,000 characters'),
  contract_type: contractTypeEnum.optional(),
  payment_structure: paymentStructureEnum.optional(),
  // For fixed-price: total amount must match
  // For hourly: not required at creation
  total_amount_cents: z
    .number()
    .int()
    .min(100, 'Total amount must be at least $1.00')
    .optional(),
  platform_fee_client_cents: z
    .number()
    .int()
    .min(0)
    .default(0),
  platform_fee_consultant_cents: z
    .number()
    .int()
    .min(0)
    .default(0),
  // Optional: if client wants to set specific dates
  start_date: z.string().optional(),
  end_date: z.string().optional(),
}).refine((value) => value.contract_type || value.payment_structure, {
  message: 'Contract type is required',
  path: ['contract_type'],
});

export type ContractCreateFormData = z.infer<typeof contractCreateSchema>;

/**
 * Schema for updating an existing contract
 */
export const contractUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  terms_markdown: z.string().min(50).max(5000).optional(),
  platform_fee_client_cents: z.number().int().min(0).optional(),
  platform_fee_consultant_cents: z.number().int().min(0).optional(),
  // Only editable if not active or funded
});

export type ContractUpdateFormData = z.infer<typeof contractUpdateSchema>;

/**
 * Schema for creating a milestone (client adds milestones to fixed-price contract)
 */
export const milestoneCreateSchema = z.object({
  contract_id: z.string().uuid('Invalid contract ID'),
  sequence_order: z.number().int().min(1).max(100),
  title: z
    .string()
    .min(3, 'Milestone title must be at least 3 characters')
    .max(200, 'Milestone title must be less than 200 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description must be less than 1,000 characters')
    .optional(),
  amount_cents: z
    .number()
    .int()
    .min(0, 'Amount cannot be negative'),
  due_date: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format',
  }),
});

export type MilestoneCreateFormData = z.infer<typeof milestoneCreateSchema>;

/**
 * Schema for updating a milestone
 */
export const milestoneUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(1000).optional(),
  amount_cents: z.number().int().min(0).optional(),
  due_date: z.string().optional(),
  deliverable_notes: z.string().max(2000).optional(),
});

export type MilestoneUpdateFormData = z.infer<typeof milestoneUpdateSchema>;

/**
 * Schema for milestone submission (consultant uploads deliverables)
 */
export const milestoneSubmitSchema = z.object({
  deliverable_notes: z.string().max(2000).optional(),
  // Deliverable storage paths would be populated by file upload
});

export type MilestoneSubmitFormData = z.infer<typeof milestoneSubmitSchema>;

/**
 * Schema for milestone approval/rejection (client)
 */
export const milestoneStatusUpdateSchema = z.object({
  status: milestoneStatusEnum,
  note: z.string().max(1000).optional(),
});

export type MilestoneStatusUpdateFormData = z.infer<typeof milestoneStatusUpdateSchema>;

/**
 * Schema for filtering contracts
 */
export const contractFilterSchema = z.object({
  client_id: z.string().uuid().optional(),
  consultant_id: z.string().uuid().optional(),
  job_id: z.string().uuid().optional(),
  status: z.array(contractStatusEnum).optional(),
  sortBy: z.enum(['created_at', 'total_amount_cents']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
});

export type ContractFilterFormData = z.infer<typeof contractFilterSchema>;

/**
 * Schema for filtering milestones
 */
export const milestoneFilterSchema = z.object({
  contract_id: z.string().uuid().optional(),
  status: z.array(milestoneStatusEnum).optional(),
  sortBy: z.enum(['sequence_order', 'due_date', 'amount_cents']).optional().default('sequence_order'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
});

export type MilestoneFilterFormData = z.infer<typeof milestoneFilterSchema>;
