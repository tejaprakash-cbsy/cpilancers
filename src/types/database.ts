/**
 * Database Type Definitions
 * Maps to PostgreSQL schema created in previous architecture phase
 */

export type UserRole = 'client' | 'consultant' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'deactivated';

export type CompanySizeTier =
  | 'startup_1_10'
  | 'small_11_50'
  | 'medium_51_200'
  | 'midmarket_201_1000'
  | 'enterprise_1000_plus';

export type AvailabilityStatus =
  | 'available'
  | 'partially_available'
  | 'busy'
  | 'unavailable';

export type SkillCategory =
  | 'core_cpi'
  | 'integration_suite'
  | 'sap_system'
  | 'protocol'
  | 'scripting'
  | 'architecture'
  | 'security'
  | 'other';

export type ProficiencyLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'expert';

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected';

export type IntegrationType =
  | 'p2p'
  | 'a2a'
  | 'b2b'
  | 'batch'
  | 'realtime'
  | 'event_driven'
  | 'hybrid';

export type ThroughputTier =
  | 'low_under_1k_daily'
  | 'moderate_1k_100k'
  | 'high_100k_1m'
  | 'mission_critical_1m_plus';

export type ComplexityTier =
  | 'standard'
  | 'moderate'
  | 'complex'
  | 'architectural';

export type BudgetType =
  | 'fixed_price'
  | 'hourly_rate'
  | 'range';

export type JobStatus =
  | 'draft'
  | 'open'
  | 'in_review'
  | 'hired'
  | 'completed'
  | 'cancelled'
  | 'closed';

export type ProposalStatus =
  | 'draft'
  | 'submitted'
  | 'shortlisted'
  | 'rejected'
  | 'withdrawn'
  | 'accepted';

export type PaymentStructure =
  | 'fixed_milestones'
  | 'hourly_capped';
export type ContractType = 'fixed_price' | 'hourly';

export type ContractStatus =
  | 'pending_acceptance'
  | 'active'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'terminated';

export type MilestoneStatus =
  | 'pending'
  | 'funded'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'disputed'
  | 'cancelled';

export type ConversationType =
  | 'direct_inquiry'
  | 'proposal_inquiry'
  | 'contract_room';
export type ConversationMemberRole = 'participant' | 'admin_observer';

export type PaymentStatus =
  | 'pending'
  | 'held_in_escrow'
  | 'released'
  | 'refunded'
  | 'failed';

export type PayoutStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export type DisputeReason =
  | 'non_delivery'
  | 'scope_mismatch'
  | 'poor_quality'
  | 'unresponsive'
  | 'payment_issue'
  | 'other';

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_refund_client'
  | 'resolved_payout_consultant'
  | 'resolved_split'
  | 'dismissed';

/**
 * Mirrors the `notification_type` PostgreSQL enum.
 *
 * The four values marked "Stage 12" were added by migration
 * 00013_notifications_stage12.sql. Stage 1 had no variant for a rejected
 * proposal, a created milestone, a failed payment or a completed contract, so
 * four of the fourteen events the notification system must cover had nowhere to
 * be recorded.
 */
export type NotificationType =
  | 'proposal_received'
  | 'proposal_shortlisted'
  | 'proposal_accepted'
  | 'proposal_rejected' // Stage 12
  | 'contract_created'
  | 'contract_accepted'
  | 'contract_completed' // Stage 12
  | 'milestone_created' // Stage 12
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'milestone_revision'
  | 'payment_escrowed'
  | 'payment_failed' // Stage 12
  | 'payment_released'
  | 'message_received'
  | 'review_submitted'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'system_alert';

// Database Table Interfaces
export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  is_email_verified: boolean;
  phone_number: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  country_code: string;
  city: string | null;
  bio_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  legal_name: string;
  brand_name: string | null;
  website_url: string | null;
  industry: string;
  company_size: CompanySizeTier;
  sap_footprint: string[];
  logo_url: string | null;
  tax_identifier: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  company_id: string;
  job_title: string;
  department: string | null;
  billing_email: string | null;
  stripe_customer_id: string | null;
  payment_verified: boolean;
  total_spent_cents: number;
  active_contracts_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConsultantProfile {
  id: string;
  user_id: string;
  professional_headline: string;
  years_sap_experience: number;
  years_cpi_experience: number;
  hourly_rate_cents: number;
  min_project_size_cents: number;
  availability_status: AvailabilityStatus;
  available_hours_per_week: number;
  github_profile_url: string | null;
  linkedin_profile_url: string | null;
  overview_markdown: string;
  avg_rating: number;
  total_reviews_count: number;
  completed_contracts_count: number;
  stripe_connect_account_id: string | null;
  payouts_enabled: boolean;
  profile_score: number;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  slug: string;
  category: SkillCategory;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ConsultantSkill {
  consultant_id: string;
  skill_id: string;
  is_primary: boolean;
  years_experience: number;
  proficiency_level: ProficiencyLevel;
  created_at: string;
}

export interface Certification {
  id: string;
  code: string;
  name: string;
  issuing_authority: string;
  validation_url_template: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ConsultantCertification {
  id: string;
  consultant_id: string;
  certification_id: string | null;
  custom_name: string | null;
  credential_id: string | null;
  issue_date: string;
  expiry_date: string | null;
  verification_document_url: string;
  verification_status: VerificationStatus;
  verified_by_admin_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Portfolio {
  id: string;
  consultant_id: string;
  title: string;
  client_industry: string;
  source_systems: string[];
  target_systems: string[];
  protocols_used: string[];
  challenge_markdown: string;
  solution_markdown: string;
  outcome_markdown: string | null;
  architecture_diagram_url: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  client_id: string;
  company_id: string;
  title: string;
  slug: string;
  integration_type: IntegrationType;
  source_systems: string[];
  target_systems: string[];
  protocols: string[];
  expected_throughput_tier: ThroughputTier;
  complexity: ComplexityTier;
  description_markdown: string;
  deliverables_markdown: string;
  estimated_duration_weeks: number;
  budget_type: BudgetType;
  budget_fixed_cents: number | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  status: JobStatus;
  views_count: number;
  proposals_count: number;
  hired_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Proposal {
  id: string;
  job_id: string;
  consultant_id: string;
  cover_letter_markdown: string;
  technical_solution_markdown: string;
  proposed_duration_weeks: number;
  proposed_price_cents: number;
  proposed_milestones: unknown; // JSONB
  status: ProposalStatus;
  client_viewed_at: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  job_id: string;
  proposal_id: string;
  client_id: string;
  consultant_id: string;
  title: string;
  terms_markdown: string;
  contract_type?: ContractType;
  payment_structure: PaymentStructure;
  total_amount_cents: number;
  platform_fee_client_cents: number;
  platform_fee_consultant_cents: number;
  status: ContractStatus;
  start_date?: string | null;
  end_date?: string | null;
  consultant_signed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  contract_id: string;
  sequence_order: number;
  title: string;
  description: string;
  amount_cents: number;
  due_date: string;
  status: MilestoneStatus;
  deliverable_notes: string | null;
  deliverable_storage_paths: string[];
  submitted_at: string | null;
  revision_requested_at: string | null;
  revision_notes: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// Stage 11: reviews and reputation.
//
// A review is only creatable by one party on a contract, rating the other, and
// only while the contract is `completed`. Those rules are enforced by the
// `enforce_review_integrity` trigger in migration 00010, not only here.
export interface Review {
  id: string;
  contract_id: string;
  reviewer_user_id: string;
  reviewee_user_id: string;
  reviewer_role: UserRole;
  reviewee_role: UserRole | null;
  rating_overall: number;
  rating_communication: number;
  rating_quality: number;
  rating_timeliness: number;
  feedback_markdown: string | null;
  is_public: boolean;
  edit_count: number;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
  deletion_reason: string | null;
  contract_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ReviewEditAction = 'created' | 'edited' | 'deleted';

export interface ReviewEdit {
  id: string;
  review_id: string;
  editor_user_id: string;
  action: ReviewEditAction;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Denormalised reputation, written only by `public.refresh_reputation`.
 *
 * `avg_rating_overall` is the real arithmetic mean and is what the UI shows.
 * `bayesian_rating` is a smoothed ordering aid and must never be displayed as if
 * it were a rating a reviewer gave.
 */
export interface Reputation {
  user_id: string;
  total_reviews_count: number;
  completed_contracts_count: number;
  avg_rating_overall: number;
  avg_rating_communication: number;
  avg_rating_quality: number;
  avg_rating_timeliness: number;
  bayesian_rating: number;
  rating_distribution: Record<string, number>;
  refreshed_at: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  /** Who caused the event. NULL once that user is deleted. Stage 12. */
  actor_user_id: string | null;
  /** Template variables, as rendered at emit time. Stage 12. */
  metadata: Record<string, unknown>;
  /**
   * Deterministic identity of the event. A partial unique index on this column is
   * what makes "no duplicate notifications for the same event" a database
   * guarantee rather than an application convention. NULL for a deliberate
   * one-off. Stage 12.
   */
  dedup_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

/** Per-channel delivery record. One row per (notification, channel). Stage 12. */
export interface NotificationDelivery {
  id: string;
  notification_id: string;
  channel: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempt_count: number;
  provider_message_id: string | null;
  last_error: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A user's explicit preference override. Only overrides are stored; a missing row
 * means "no opinion" and the defaults in `src/lib/notifications/defaults.ts` apply.
 * Stage 12.
 */
export interface NotificationPreference {
  user_id: string;
  type: NotificationType;
  channel: string;
  enabled: boolean;
  updated_at: string;
}

// Stage 10: payment ledger.
//
// Amounts are integer minor units (paise) throughout. The database CHECK
// `chk_payment_math` enforces gross_amount_cents = platform_fee_cents +
// net_amount_cents, so any writer must satisfy that identity.
export interface Payment {
  id: string;
  contract_id: string;
  milestone_id: string | null;
  payer_client_id: string;
  recipient_consultant_id: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  net_amount_cents: number;
  currency: string;
  provider: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_refund_id: string | null;
  status: PaymentStatus;
  escrow_funded_at: string | null;
  escrow_released_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payout {
  id: string;
  consultant_id: string;
  payment_id: string;
  amount_cents: number;
  currency: string;
  razorpay_transfer_id: string | null;
  razorpay_settlement_id: string | null;
  status: PayoutStatus;
  failure_reason: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentRefundStatus = 'pending' | 'processed' | 'failed';

export interface PaymentRefund {
  id: string;
  payment_id: string;
  provider: string;
  provider_refund_id: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentRefundStatus;
  speed: 'normal' | 'optimum' | null;
  reason: string | null;
  failure_reason: string | null;
  initiated_by_user_id: string | null;
  transfer_reversal_id: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformFeeConfig {
  id: string;
  scope: 'global' | 'contract' | 'milestone';
  contract_id: string | null;
  milestone_id: string | null;
  basis_points: number;
  fixed_cents: number;
  min_fee_cents: number;
  max_fee_cents: number | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PaymentWebhookProcessingStatus =
  | 'received'
  | 'processed'
  | 'ignored'
  | 'failed';

export interface PaymentWebhookEvent {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  processing_status: PaymentWebhookProcessingStatus;
  payment_id: string | null;
  attempt_count: number;
  last_error: string | null;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at: string | null;
  created_at: string;
}

export interface PaymentStatusHistory {
  id: string;
  payment_id: string;
  from_status: string | null;
  to_status: string;
  trigger_source: 'service' | 'webhook' | 'reconciliation';
  provider_event_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type ForumDiscussionStatus = 'open' | 'locked' | 'deleted';
export type ForumPostStatus = 'active' | 'deleted';

export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface ForumDiscussion {
  id: string;
  category_id: string;
  author_id: string;
  title: string;
  body: string;
  status: ForumDiscussionStatus;
  is_pinned: boolean;
  view_count: number;
  reply_count: number;
  upvote_count: number;
  accepted_post_id: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  /**
   * Optional author join returned by `ForumService.getDiscussions`.
   *
   * Declared so the UI can read `discussion.author.display_name` without an
   * `as any` cast. The previous shape omitted this field, which pushed the
   * cast into the component and defeated type checking on the one field the
   * list actually renders.
   */
  author?: {
    id: string;
    display_name: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

export interface ForumPost {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  status: ForumPostStatus;
  upvote_count: number;
  created_at: string;
  updated_at: string;
}

export interface ForumVote {
  id: string;
  user_id: string;
  discussion_id: string | null;
  post_id: string | null;
  created_at: string;
}

export interface ForumReport {
  id: string;
  reporter_id: string;
  discussion_id: string | null;
  post_id: string | null;
  reason: string;
  details: string | null;
  resolved: boolean;
  created_at: string;
}
