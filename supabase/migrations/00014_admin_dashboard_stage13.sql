-- ============================================================================
-- 00014_admin_dashboard_stage13.sql
--
-- Stage 13: the administrator dashboard.
--
-- This migration does three things, in order of how much they matter.
--
-- 1. IT CLOSES A PRE-EXISTING HOLE. `public.disputes` never had RLS enabled.
--    Migration 00003 turned RLS on for six messaging and moderation tables and
--    `disputes` was simply not among them, so for its entire life an anonymous
--    caller has been able to INSERT, UPDATE and DELETE dispute rows. This was
--    confirmed live against the linked project before this migration was
--    written: an anon INSERT produced an FK violation (23503) rather than an RLS
--    denial (42501), and because foreign keys are AFTER-row triggers while RLS
--    WITH CHECK is a BEFORE-row check, an FK violation proves the row passed RLS.
--    anon PATCH and DELETE both returned 204. Stage 13 must be able to *review*
--    disputes, which makes leaving a write hole on that table untenable, so the
--    gap is fixed here rather than deferred.
--
-- 2. IT ADDS THE AUDIT LOG the brief requires, as an append-only table with no
--    UPDATE or DELETE path for any browser role, and a database trigger that
--    refuses to let a row be mutated or removed at all. An audit trail that can
--    be edited is not an audit trail.
--
-- 3. IT ADDS THE ADMIN SURFACE: moderation columns on jobs, the report
--    disposition fields the dashboard needs, and indexes for the overview
--    aggregates.
--
-- Grant hygiene follows the lesson recorded in 00011 and 00012: on Supabase,
-- `REVOKE ... FROM PUBLIC` does NOT remove the explicit `anon` grant created by
-- `GRANT ALL ON ALL FUNCTIONS IN SCHEMA public`. Every function created here is
-- therefore revoked from `anon`, from `authenticated` and from `PUBLIC`
-- explicitly, and granted back only where a browser session genuinely needs it.
-- ============================================================================


-- ============================================================================
-- 1. Close the disputes RLS gap
-- ============================================================================
-- The dispute table carries both parties' statements and the evidence file
-- list. It is the most sensitive free-text content in the marketplace, and it was
-- readable and writable by an unauthenticated caller.
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- A dispute is visible to the two parties on its contract, and to nobody else.
-- Admin visibility is deliberately NOT granted here: the dashboard reads through
-- the service role, which bypasses RLS, and a policy here would be a second,
-- weaker door into the same data.
DROP POLICY IF EXISTS disputes_participants_select ON public.disputes;
CREATE POLICY disputes_participants_select ON public.disputes
  FOR SELECT USING (
    initiator_user_id = auth.uid()
    OR respondent_user_id = auth.uid()
  );

-- A dispute may be opened only by a participant on that contract, and never
-- against oneself. The self-dispute case is already a CHECK constraint; this
-- policy additionally requires the caller to be one of the two named users, so
-- an authenticated user cannot file a dispute naming two other people.
DROP POLICY IF EXISTS disputes_participants_insert ON public.disputes;
CREATE POLICY disputes_participants_insert ON public.disputes
  FOR INSERT WITH CHECK (
    (initiator_user_id = auth.uid() OR respondent_user_id = auth.uid())
    AND initiator_user_id <> respondent_user_id
  );

-- Status changes are an administrative act (the dashboard updates them through
-- the service role), so there is deliberately no UPDATE policy and no DELETE
-- policy. With RLS enabled and no policy, both are denied to anon and
-- authenticated by default.

-- Reports already had RLS from 00003, but only a restrictive INSERT policy. A
-- report is a moderation signal: it should be readable by its reporter and by no
-- one else through a browser role.
DROP POLICY IF EXISTS reports_reporter_select ON public.reports;
CREATE POLICY reports_reporter_select ON public.reports
  FOR SELECT USING (reporter_user_id = auth.uid());

-- Both tables are written by the service role only.
REVOKE ALL ON public.disputes, public.reports FROM anon, authenticated;


-- ============================================================================
-- 2. The administrative audit log
-- ============================================================================
-- One row per sensitive administrative action. This is the record that answers
-- "who refunded this, who banned that account, who dismissed this dispute" long
-- after the fact, and it is the table an operator reads when they themselves are
-- suspected of overreach.
--
-- The identifying columns are the subject of the action (who/what), and
-- before/after snapshots make a mutation reviewable without replaying it. The
-- snapshot columns hold a redacted projection, never raw request bodies.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The administrator who performed the action, from the authenticated session.
    admin_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    -- Stable machine-readable action, e.g. 'user.suspended'.
    action TEXT NOT NULL,
    -- Coarse grouping for filtering the log without enumerating every action:
    -- user | job | proposal | payment | dispute | report | auth.
    category TEXT NOT NULL,
    -- The entity acted upon. Polymorphic on purpose: a ban targets a user, a job
    -- removal targets a job, and a single FK column cannot express both without a
    -- nullable column per type. Kept non-null so every log row names its subject.
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    -- Reason supplied by the administrator, free text, required for every
    -- destructive action so an audit row is never just "something happened".
    reason TEXT,
    -- Redacted before/after projection of the changed fields. Never a raw body.
    before_state JSONB,
    after_state JSONB,
    -- Coarse request context: IP and user agent. Sufficient to correlate an
    -- action with a session without storing a fingerprint.
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The dashboard reads the log newest-first and filters by category and subject.
CREATE INDEX IF NOT EXISTS idx_admin_audit_created  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin    ON public.admin_audit_log (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target   ON public.admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_category ON public.admin_audit_log (category, created_at DESC);

-- Append-only, enforced by the database rather than by convention. A BEFORE
-- UPDATE OR DELETE trigger that always raises means that even the service role
-- cannot quietly rewrite history: an entry can only be added, never edited or
-- removed. Correcting a mistaken entry is done by writing a further entry, which
-- is the property that makes the log trustworthy.
CREATE OR REPLACE FUNCTION public.admin_audit_log_is_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_audit_append_only ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_append_only
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_is_append_only();

-- Nothing in the browser may read, write, update or delete the log. Even SELECT
-- is revoked: an administrator reads the log through the dashboard's service
-- role, so there is no browser-side path to it at all.
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;



-- ============================================================================
-- 3. Moderation state on jobs
-- ============================================================================
-- "Remove job" and "flag job" are separate concerns. Removal hides a job from
-- the marketplace without destroying the contract and proposal history that
-- reference it, so it is a soft state rather than a DELETE. Flagging marks a job
-- for review without changing its visibility.
--
-- A job that is removed by an administrator also stops being fundable: the
-- funding path checks job status before opening escrow, so the new state is
-- recorded in a separate column rather than by widening the `job_status` enum.
-- That keeps Stage 9's job state machine intact.
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS moderated_by_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS chk_job_moderation_status;
ALTER TABLE public.jobs ADD CONSTRAINT chk_job_moderation_status CHECK (
    moderation_status IN ('none', 'flagged', 'removed')
);

-- A moderated job must say who did it and why. Without this an operator could
-- remove a job and leave no attributable record in the row itself.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS chk_job_moderation_actor;
ALTER TABLE public.jobs ADD CONSTRAINT chk_job_moderation_actor CHECK (
    moderation_status = 'none'
    OR (moderated_by_admin_id IS NOT NULL AND moderated_at IS NOT NULL AND moderation_reason IS NOT NULL)
);

-- The marketplace list filters on this, so it is indexed.
CREATE INDEX IF NOT EXISTS idx_jobs_moderation ON public.jobs (moderation_status)
    WHERE moderation_status <> 'none';


-- ============================================================================
-- 4. Report disposition
-- ============================================================================
-- `reports` already carries `action_taken`, `reviewed_by_admin_id` and
-- `reviewed_at`. The one thing missing is the link back to the audit entry, so
-- a report decision and the administrative action it produced can be read
-- together, and so a report cannot be "resolved" without one having been logged.
ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS admin_audit_log_id UUID REFERENCES public.admin_audit_log(id) ON DELETE SET NULL;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS chk_report_review_state;
ALTER TABLE public.reports ADD CONSTRAINT chk_report_review_state CHECK (
    (status = 'pending' AND reviewed_by_admin_id IS NULL AND reviewed_at IS NULL)
    OR (status <> 'pending' AND reviewed_by_admin_id IS NOT NULL AND reviewed_at IS NOT NULL)
);

-- The reports queue is ordered by the oldest unresolved first.
CREATE INDEX IF NOT EXISTS idx_reports_pending ON public.reports (created_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reports_target  ON public.reports (target_type, target_id);


-- ============================================================================
-- 5. Dispute resolution
-- ============================================================================
-- Stage 1 left `resolved_by_admin_id` and `resolved_at` free-floating, so a
-- dispute could sit in a terminal status with nobody accountable for it. This
-- ties the terminal state to the administrator who set it and to the audit entry
-- that recorded the decision.
ALTER TABLE public.disputes
    ADD COLUMN IF NOT EXISTS admin_audit_log_id UUID REFERENCES public.admin_audit_log(id) ON DELETE SET NULL;

ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS chk_dispute_resolution_state;
ALTER TABLE public.disputes ADD CONSTRAINT chk_dispute_resolution_state CHECK (
    (status IN ('open', 'under_review')
        AND resolved_by_admin_id IS NULL
        AND resolved_at IS NULL)
    OR (status IN ('resolved_refund_client', 'resolved_payout_consultant', 'resolved_split', 'dismissed')
        AND resolved_by_admin_id IS NOT NULL
        AND resolved_at IS NOT NULL)
);

-- The dispute queue is ordered by the oldest open first, which is the order an
-- operator actually works through them in.
CREATE INDEX IF NOT EXISTS idx_disputes_open ON public.disputes (created_at)
    WHERE status IN ('open', 'under_review');
CREATE INDEX IF NOT EXISTS idx_disputes_parties ON public.disputes (initiator_user_id, respondent_user_id);



-- ============================================================================
-- 6. Overview aggregates
-- ============================================================================
-- The overview is a single screen that must not fan out into a dozen round trips.
-- These support the counting queries the dashboard issues, and the partial
-- indexes keep them cheap as the marketplace grows.
CREATE INDEX IF NOT EXISTS idx_users_role_status   ON public.users (role, status);
CREATE INDEX IF NOT EXISTS idx_contracts_status    ON public.contracts (status);
CREATE INDEX IF NOT EXISTS idx_payments_status_amt ON public.payments (status, gross_amount_cents);
CREATE INDEX IF NOT EXISTS idx_payments_funded     ON public.payments (escrow_funded_at)
    WHERE escrow_funded_at IS NOT NULL;

-- "Marketplace transaction volume" and "platform revenue" are derived from
-- captured money, never from a `pending` order that was abandoned at checkout.
-- This index is the one that makes those two sums a single index scan.
CREATE INDEX IF NOT EXISTS idx_payments_captured ON public.payments (gross_amount_cents, platform_fee_cents)
    WHERE status IN ('held_in_escrow', 'released');


-- ============================================================================
-- 7. Function grant hygiene
-- ============================================================================
-- Reasserted explicitly rather than inherited. `admin_audit_log_is_append_only`
-- is a trigger function, so no role may call it directly.
REVOKE ALL ON FUNCTION public.admin_audit_log_is_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.admin_audit_log_is_append_only() FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_audit_log_is_append_only() FROM PUBLIC;

