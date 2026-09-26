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

export type NotificationType =
  | 'proposal_received'
  | 'proposal_shortlisted'
  | 'proposal_accepted'
  | 'contract_created'
  | 'contract_accepted'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'milestone_revision'
  | 'payment_escrowed'
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

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}
