-- ============================================================================
-- INITIAL DATABASE SCHEMA MIGRATION: 00001_initial_schema.sql
-- SAP Integration Services Freelance Marketplace
-- Generated: 2026-09-22
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enum Definitions
CREATE TYPE user_role AS ENUM ('client', 'consultant', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deactivated');
CREATE TYPE company_size_tier AS ENUM ('startup_1_10', 'small_11_50', 'medium_51_200', 'midmarket_201_1000', 'enterprise_1000_plus');
CREATE TYPE availability_status AS ENUM ('available', 'partially_available', 'busy', 'unavailable');
CREATE TYPE skill_category AS ENUM ('core_cpi', 'integration_suite', 'sap_system', 'protocol', 'scripting', 'architecture', 'security', 'other');
CREATE TYPE proficiency_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
CREATE TYPE verification_status AS ENUM ('unverified', 'pending', 'verified', 'rejected');
CREATE TYPE integration_type AS ENUM ('p2p', 'a2a', 'b2b', 'batch', 'realtime', 'event_driven', 'hybrid');
CREATE TYPE throughput_tier AS ENUM ('low_under_1k_daily', 'moderate_1k_100k', 'high_100k_1m', 'mission_critical_1m_plus');
CREATE TYPE complexity_tier AS ENUM ('standard', 'moderate', 'complex', 'architectural');
CREATE TYPE budget_type AS ENUM ('fixed_price', 'hourly_rate', 'range');
CREATE TYPE job_status AS ENUM ('draft', 'open', 'in_review', 'hired', 'completed', 'cancelled', 'closed');
CREATE TYPE proposal_status AS ENUM ('draft', 'submitted', 'shortlisted', 'rejected', 'withdrawn', 'accepted');
CREATE TYPE payment_structure AS ENUM ('fixed_milestones', 'hourly_capped');
CREATE TYPE contract_status AS ENUM ('pending_acceptance', 'active', 'completed', 'disputed', 'cancelled', 'terminated');
CREATE TYPE milestone_status AS ENUM ('pending', 'active', 'submitted', 'revision_requested', 'approved', 'cancelled');
CREATE TYPE conversation_type AS ENUM ('direct_inquiry', 'proposal_inquiry', 'contract_room');
CREATE TYPE conversation_member_role AS ENUM ('participant', 'admin_observer');
CREATE TYPE payment_status AS ENUM ('pending', 'held_in_escrow', 'released', 'refunded', 'failed');
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE dispute_reason AS ENUM ('non_delivery', 'scope_mismatch', 'poor_quality', 'unresponsive', 'payment_issue', 'other');
CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved_refund_client', 'resolved_payout_consultant', 'resolved_split', 'dismissed');
CREATE TYPE report_target_type AS ENUM ('user', 'job', 'proposal', 'review', 'message');
CREATE TYPE report_status AS ENUM ('pending', 'investigating', 'action_taken', 'dismissed');
CREATE TYPE notification_type AS ENUM (
    'proposal_received', 'proposal_shortlisted', 'proposal_accepted',
    'contract_created', 'contract_accepted', 'milestone_submitted',
    'milestone_approved', 'milestone_revision', 'payment_escrowed',
    'payment_released', 'message_received', 'review_submitted',
    'dispute_opened', 'dispute_resolved', 'system_alert'
);

-- Automatic Timestamp Trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email CITEXT NOT NULL UNIQUE,
    role user_role NOT NULL,
    status user_status NOT NULL DEFAULT 'active',
    is_email_verified BOOLEAN NOT NULL DEFAULT false,
    phone_number TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    country_code VARCHAR(2) NOT NULL,
    city TEXT,
    bio_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Companies
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name TEXT NOT NULL,
    brand_name TEXT,
    website_url TEXT,
    industry TEXT NOT NULL,
    company_size company_size_tier NOT NULL DEFAULT 'medium_51_200',
    sap_footprint TEXT[] NOT NULL DEFAULT '{}',
    logo_url TEXT,
    tax_identifier TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Client Profiles
CREATE TABLE IF NOT EXISTS public.client_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    job_title TEXT NOT NULL,
    department TEXT,
    billing_email CITEXT,
    stripe_customer_id TEXT UNIQUE,
    payment_verified BOOLEAN NOT NULL DEFAULT false,
    total_spent_cents BIGINT NOT NULL DEFAULT 0,
    active_contracts_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Consultant Profiles
CREATE TABLE IF NOT EXISTS public.consultant_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    professional_headline TEXT NOT NULL,
    years_sap_experience NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (years_sap_experience >= 0),
    years_cpi_experience NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (years_cpi_experience >= 0),
    hourly_rate_cents BIGINT NOT NULL CHECK (hourly_rate_cents > 0),
    min_project_size_cents BIGINT NOT NULL DEFAULT 0 CHECK (min_project_size_cents >= 0),
    availability_status availability_status NOT NULL DEFAULT 'available',
    available_hours_per_week INTEGER NOT NULL DEFAULT 40 CHECK (available_hours_per_week BETWEEN 0 AND 168),
    github_profile_url TEXT,
    linkedin_profile_url TEXT,
    overview_markdown TEXT NOT NULL,
    avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0.00 CHECK (avg_rating BETWEEN 0.00 AND 5.00),
    total_reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (total_reviews_count >= 0),
    completed_contracts_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_contracts_count >= 0),
    stripe_connect_account_id TEXT UNIQUE,
    payouts_enabled BOOLEAN NOT NULL DEFAULT false,
    profile_score INTEGER NOT NULL DEFAULT 0 CHECK (profile_score BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Skills
CREATE TABLE IF NOT EXISTS public.skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    category skill_category NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Consultant Skills
CREATE TABLE IF NOT EXISTS public.consultant_skills (
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    years_experience NUMERIC(4,1) NOT NULL DEFAULT 1.0 CHECK (years_experience >= 0),
    proficiency_level proficiency_level NOT NULL DEFAULT 'advanced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (consultant_id, skill_id)
);

-- 8. Certifications Master
CREATE TABLE IF NOT EXISTS public.certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    issuing_authority TEXT NOT NULL DEFAULT 'SAP SE',
    validation_url_template TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Consultant Certifications
CREATE TABLE IF NOT EXISTS public.consultant_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    certification_id UUID REFERENCES public.certifications(id) ON DELETE SET NULL,
    custom_name TEXT,
    credential_id TEXT,
    issue_date DATE NOT NULL,
    expiry_date DATE,
    verification_document_url TEXT NOT NULL,
    verification_status verification_status NOT NULL DEFAULT 'pending',
    verified_by_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cert_name CHECK (certification_id IS NOT NULL OR custom_name IS NOT NULL)
);

-- 10. Portfolios
CREATE TABLE IF NOT EXISTS public.portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    client_industry TEXT NOT NULL,
    source_systems TEXT[] NOT NULL DEFAULT '{}',
    target_systems TEXT[] NOT NULL DEFAULT '{}',
    protocols_used TEXT[] NOT NULL DEFAULT '{}',
    challenge_markdown TEXT NOT NULL,
    solution_markdown TEXT NOT NULL,
    outcome_markdown TEXT,
    architecture_diagram_url TEXT,
    completed_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Jobs
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    integration_type integration_type NOT NULL,
    source_systems TEXT[] NOT NULL DEFAULT '{}',
    target_systems TEXT[] NOT NULL DEFAULT '{}',
    protocols TEXT[] NOT NULL DEFAULT '{}',
    expected_throughput_tier throughput_tier NOT NULL DEFAULT 'moderate_1k_100k',
    complexity complexity_tier NOT NULL DEFAULT 'moderate',
    description_markdown TEXT NOT NULL,
    deliverables_markdown TEXT NOT NULL,
    estimated_duration_weeks INTEGER NOT NULL DEFAULT 4 CHECK (estimated_duration_weeks > 0),
    budget_type budget_type NOT NULL,
    budget_fixed_cents BIGINT,
    budget_min_cents BIGINT,
    budget_max_cents BIGINT,
    status job_status NOT NULL DEFAULT 'draft',
    views_count INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
    proposals_count INTEGER NOT NULL DEFAULT 0 CHECK (proposals_count >= 0),
    hired_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_job_budget CHECK (
        (budget_type = 'fixed_price' AND budget_fixed_cents IS NOT NULL AND budget_fixed_cents > 0) OR
        (budget_type = 'range' AND budget_min_cents IS NOT NULL AND budget_max_cents IS NOT NULL AND budget_min_cents <= budget_max_cents) OR
        (budget_type = 'hourly_rate')
    )
);

-- 12. Job Skills
CREATE TABLE IF NOT EXISTS public.job_skills (
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (job_id, skill_id)
);

-- 13. Proposals
CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    cover_letter_markdown TEXT NOT NULL,
    technical_solution_markdown TEXT NOT NULL,
    proposed_duration_weeks INTEGER NOT NULL CHECK (proposed_duration_weeks > 0),
    proposed_price_cents BIGINT NOT NULL CHECK (proposed_price_cents > 0),
    proposed_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
    status proposal_status NOT NULL DEFAULT 'submitted',
    client_viewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_job_consultant_proposal UNIQUE (job_id, consultant_id)
);

-- 14. Contracts
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
    proposal_id UUID NOT NULL UNIQUE REFERENCES public.proposals(id) ON DELETE RESTRICT,
    client_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE RESTRICT,
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    terms_markdown TEXT NOT NULL,
    payment_structure payment_structure NOT NULL DEFAULT 'fixed_milestones',
    total_amount_cents BIGINT NOT NULL CHECK (total_amount_cents > 0),
    platform_fee_client_cents BIGINT NOT NULL DEFAULT 0 CHECK (platform_fee_client_cents >= 0),
    platform_fee_consultant_cents BIGINT NOT NULL DEFAULT 0 CHECK (platform_fee_consultant_cents >= 0),
    status contract_status NOT NULL DEFAULT 'pending_acceptance',
    consultant_signed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Milestones
CREATE TABLE IF NOT EXISTS public.milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL CHECK (sequence_order > 0),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    due_date DATE NOT NULL,
    status milestone_status NOT NULL DEFAULT 'pending',
    deliverable_notes TEXT,
    deliverable_storage_paths TEXT[] NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMPTZ,
    revision_requested_at TIMESTAMPTZ,
    revision_notes TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contract_milestone_seq UNIQUE (contract_id, sequence_order)
);

-- 16. Conversations
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_type conversation_type NOT NULL DEFAULT 'proposal_inquiry',
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
    contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    title TEXT,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Conversation Members
CREATE TABLE IF NOT EXISTS public.conversation_members (
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    member_role conversation_member_role NOT NULL DEFAULT 'participant',
    last_read_message_id UUID,
    last_read_at TIMESTAMPTZ,
    is_muted BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- 18. Messages
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    is_system_generated BOOLEAN NOT NULL DEFAULT false,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. Message Attachments
CREATE TABLE IF NOT EXISTS public.message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for conversation_members last_read_message_id
ALTER TABLE public.conversation_members
ADD CONSTRAINT fk_member_last_read_message
FOREIGN KEY (last_read_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

-- 20. Payments (Escrow Ledger)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE RESTRICT,
    payer_client_id UUID NOT NULL REFERENCES public.client_profiles(id) ON DELETE RESTRICT,
    recipient_consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE RESTRICT,
    gross_amount_cents BIGINT NOT NULL CHECK (gross_amount_cents > 0),
    platform_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
    net_amount_cents BIGINT NOT NULL CHECK (net_amount_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_charge_id TEXT UNIQUE,
    status payment_status NOT NULL DEFAULT 'pending',
    escrow_funded_at TIMESTAMPTZ,
    escrow_released_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_math CHECK (gross_amount_cents = platform_fee_cents + net_amount_cents)
);

-- 21. Payouts (Stripe Connect)
CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    stripe_transfer_id TEXT UNIQUE,
    stripe_payout_id TEXT,
    status payout_status NOT NULL DEFAULT 'pending',
    failure_reason TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
    reviewer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    reviewee_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    reviewer_role user_role NOT NULL,
    rating_overall SMALLINT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
    rating_communication SMALLINT NOT NULL CHECK (rating_communication BETWEEN 1 AND 5),
    rating_technical_expertise SMALLINT NOT NULL CHECK (rating_technical_expertise BETWEEN 1 AND 5),
    rating_schedule_adherence SMALLINT NOT NULL CHECK (rating_schedule_adherence BETWEEN 1 AND 5),
    feedback_markdown TEXT,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contract_reviewer UNIQUE (contract_id, reviewer_user_id),
    CONSTRAINT chk_no_self_review CHECK (reviewer_user_id != reviewee_user_id)
);

-- 23. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    action_url TEXT,
    entity_type TEXT,
    entity_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. Disputes
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE RESTRICT,
    initiator_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    respondent_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    reason dispute_reason NOT NULL,
    claimed_amount_cents BIGINT NOT NULL CHECK (claimed_amount_cents >= 0),
    initiator_statement TEXT NOT NULL,
    respondent_statement TEXT,
    evidence_storage_paths TEXT[] NOT NULL DEFAULT '{}',
    status dispute_status NOT NULL DEFAULT 'open',
    resolution_summary TEXT,
    resolved_by_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_no_self_dispute CHECK (initiator_user_id != respondent_user_id)
);

-- 25. Reports
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    target_type report_target_type NOT NULL,
    target_id UUID NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status report_status NOT NULL DEFAULT 'pending',
    action_taken TEXT,
    reviewed_by_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
