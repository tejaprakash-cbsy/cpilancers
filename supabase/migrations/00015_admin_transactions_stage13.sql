-- ============================================================================
-- 00015_admin_transactions_stage13.sql
--
-- Stage 13 remediation: makes administrative mutations atomic (audit findings
-- M-1 and M-2). 00014 is already applied, so this is additive and 00014 is left
-- exactly as it is.
--
-- M-1: AdminService wrote the audit entry and then updated the row as two
-- separate statements. A crash between them left an audit entry describing an
-- action that never happened. Audit-first ordering already guaranteed the
-- security property that matters - NO AUDIT, NO MUTATION - but it could not
-- prevent that false-positive entry.
--
-- M-2: before_state / after_state were assembled in application code from a row
-- read BEFORE the write, so a concurrent writer could make the recorded "before"
-- state misleading.
--
-- Both are fixed by performing the audit insert and the row update inside ONE
-- database transaction, and by deriving the audit snapshots from the row the
-- UPDATE actually matched (the target is locked FOR UPDATE first) rather than
-- from a value read beforehand.
--
-- SECURITY. These are the most privileged objects in the schema, so they are
-- locked down deliberately:
--
--   * SECURITY DEFINER is required, because the tables are otherwise reached
--     through an RLS-protected path. It is also precisely why the grant list
--     below is the security boundary, and it is written out in full.
--   * search_path is pinned to public, so no caller-controlled schema can be
--     searched first and shadow a function or table name.
--   * EXECUTE is revoked from anon, from authenticated AND from PUBLIC. Only
--     service_role keeps it. Lesson from 00011/00012: Supabase applies
--     `GRANT ALL ON ALL FUNCTIONS IN SCHEMA public`, which creates an EXPLICIT
--     anon grant that `REVOKE ... FROM PUBLIC` does not remove - so the explicit
--     `FROM anon` revoke is the part that actually matters.
--   * The role check stays in AdminService.requireAdmin, which reads the role
--     from the database. What crosses the boundary is a boolean, never an
--     identity a caller may choose.
--   * p_admin_user_id is taken from that trusted server-side context and is
--     RE-VALIDATED here: the named user must exist, hold the admin role and be
--     active. A caller cannot assert an administrator that does not exist.
--   * Self-moderation is re-checked here as well, so the rule does not depend on
--     the caller having remembered it.
--   * The state machine is re-evaluated in SQL against the row as it exists at
--     write time, so a stale or forged transition is refused even if a future
--     caller reached these functions directly.
--   * These functions accept no arbitrary SQL, no caller-supplied query and no
--     table name, and write only to the one table each names. A single generic
--     function taking a table name would be a dynamic-SQL injection surface and
--     is deliberately avoided.
--
-- Because PostgreSQL functions run inside a transaction, an exception raised
-- anywhere in the body rolls back the audit insert as well as the update. The
-- two can no longer diverge.
-- ============================================================================


-- ============================================================================
-- 1. users: status moderation, atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_moderate_user(
    p_admin_user_id   UUID,
    p_target_id       UUID,
    p_to_status       TEXT,
    p_reason          TEXT,
    p_ip_address      TEXT DEFAULT NULL,
    p_user_agent      TEXT DEFAULT NULL
)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    public.users%ROWTYPE;
  v_target   public.users%ROWTYPE;
  v_updated  public.users%ROWTYPE;
BEGIN
  -- The actor must be a real, active administrator. A caller cannot assert one.
  SELECT * INTO v_actor FROM public.users WHERE id = p_admin_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acting administrator % does not exist', p_admin_user_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_actor.role <> 'admin' OR v_actor.status <> 'active' THEN
    RAISE EXCEPTION 'Acting user % is not an active administrator', p_admin_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Self-moderation is refused in the database as well as in the service.
  IF p_admin_user_id = p_target_id THEN
    RAISE EXCEPTION 'An administrator cannot change their own account status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_to_status NOT IN ('active', 'suspended', 'deactivated') THEN
    RAISE EXCEPTION 'Invalid target status %', p_to_status USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the target, so the snapshot below and the update below cannot diverge.
  SELECT * INTO v_target FROM public.users WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_target_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_target.status = p_to_status THEN
    RAISE EXCEPTION 'This account is already "%"', p_to_status USING ERRCODE = 'check_violation';
  END IF;
  -- The state machine, re-evaluated against the row as it exists at write time.
  IF NOT (
       (v_target.status = 'active'    AND p_to_status IN ('suspended', 'deactivated'))
    OR (v_target.status = 'suspended' AND p_to_status IN ('active', 'deactivated'))
  ) THEN
    RAISE EXCEPTION 'A "%" account cannot become "%"', v_target.status, p_to_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Snapshot taken from the LOCKED row, so the recorded "before" is exactly what
  -- the UPDATE matched (M-2).
  INSERT INTO public.admin_audit_log (
    admin_user_id, action, category, target_type, target_id, reason,
    before_state, after_state, ip_address, user_agent
  ) VALUES (
    p_admin_user_id,
    CASE p_to_status
      WHEN 'suspended'   THEN 'user.suspended'
      WHEN 'deactivated' THEN 'user.banned'
      ELSE 'user.reinstated'
    END,
    'user', 'user', p_target_id::text, p_reason,
    jsonb_build_object('status', v_target.status, 'role', v_target.role),
    jsonb_build_object('status', p_to_status, 'role', v_target.role),
    p_ip_address, p_user_agent
  );

  UPDATE public.users
     SET status = p_to_status, updated_at = NOW()
   WHERE id = p_target_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;


-- ============================================================================
-- 2. jobs: flag / unflag / remove, atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_moderate_job(
    p_admin_user_id   UUID,
    p_target_id       UUID,
    p_to_moderation   TEXT,
    p_reason          TEXT,
    p_ip_address      TEXT DEFAULT NULL,
    p_user_agent      TEXT DEFAULT NULL
)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    public.users%ROWTYPE;
  v_target   public.jobs%ROWTYPE;
  v_updated  public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id = p_admin_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acting administrator % does not exist', p_admin_user_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_actor.role <> 'admin' OR v_actor.status <> 'active' THEN
    RAISE EXCEPTION 'Acting user % is not an active administrator', p_admin_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_to_moderation NOT IN ('none', 'flagged', 'removed') THEN
    RAISE EXCEPTION 'Invalid moderation status %', p_to_moderation
      USING ERRCODE = 'check_violation';
  END IF;
  -- Flagging and removing carry a reason; clearing a flag must not invent one.
  IF p_to_moderation <> 'none' AND COALESCE(length(trim(p_reason)), 0) < 3 THEN
    RAISE EXCEPTION 'A reason is required to flag or remove a job'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_target FROM public.jobs WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found', p_target_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_target.moderation_status = p_to_moderation THEN
    RAISE EXCEPTION 'This job is already "%"', p_to_moderation
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (
       (v_target.moderation_status = 'none'    AND p_to_moderation IN ('flagged', 'removed'))
    OR (v_target.moderation_status = 'flagged' AND p_to_moderation IN ('removed', 'none'))
    OR (v_target.moderation_status = 'removed' AND p_to_moderation = 'none')
  ) THEN
    RAISE EXCEPTION 'A job that is "%" cannot become "%"',
      v_target.moderation_status, p_to_moderation USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, category, target_type, target_id, reason,
    before_state, after_state, ip_address, user_agent
  ) VALUES (
    p_admin_user_id,
    CASE p_to_moderation
      WHEN 'removed' THEN 'job.removed'
      WHEN 'flagged'  THEN 'job.flagged'
      ELSE 'job.moderation_cleared'
    END,
    'job', 'job', p_target_id::text, p_reason,
    jsonb_build_object('moderation_status', v_target.moderation_status, 'status', v_target.status),
    jsonb_build_object('moderation_status', p_to_moderation, 'status', v_target.status),
    p_ip_address, p_user_agent
  );

  UPDATE public.jobs
     SET moderation_status     = p_to_moderation,
         moderation_reason     = CASE WHEN p_to_moderation = 'none' THEN NULL ELSE p_reason END,
         moderated_by_admin_id = CASE WHEN p_to_moderation = 'none' THEN NULL ELSE p_admin_user_id END,
         moderated_at          = CASE WHEN p_to_moderation = 'none' THEN NULL ELSE NOW() END,
         updated_at            = NOW()
   WHERE id = p_target_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;



-- ============================================================================
-- 3. disputes: status transition, atomic
--
-- Deliberately does NOT move money. Refunding stays in PaymentService, which is
-- administrator-only and already audited; a dispute resolution here records a
-- decision and its rationale. Coupling a disbursement reversal into this
-- function would create a second, differently-authorized path to the payment
-- tables, which is the exact shape of the Stage 10 refund bypass.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_dispute(
    p_admin_user_id   UUID,
    p_target_id       UUID,
    p_to_status       TEXT,
    p_resolution     TEXT,
    p_ip_address      TEXT DEFAULT NULL,
    p_user_agent      TEXT DEFAULT NULL
)
RETURNS public.disputes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      public.users%ROWTYPE;
  v_target     public.disputes%ROWTYPE;
  v_updated    public.disputes%ROWTYPE;
  v_audit_id   UUID;
  v_terminal   BOOLEAN;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id = p_admin_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acting administrator % does not exist', p_admin_user_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_actor.role <> 'admin' OR v_actor.status <> 'active' THEN
    RAISE EXCEPTION 'Acting user % is not an active administrator', p_admin_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_to_status NOT IN (
       'open', 'under_review', 'resolved_refund_client',
       'resolved_payout_consultant', 'resolved_split', 'dismissed'
  ) THEN
    RAISE EXCEPTION 'Invalid dispute status %', p_to_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_target FROM public.disputes WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute % not found', p_target_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_target.status = p_to_status THEN
    RAISE EXCEPTION 'This dispute is already "%"', p_to_status USING ERRCODE = 'check_violation';
  END IF;
  -- Terminal states are terminal: a resolved or dismissed dispute cannot be
  -- reopened, because that would move money back into an unresolved state with
  -- no record of who decided it was a good idea.
  IF v_target.status IN ('resolved_refund_client', 'resolved_payout_consultant', 'resolved_split', 'dismissed') THEN
    RAISE EXCEPTION 'A resolved dispute cannot be reopened' USING ERRCODE = 'check_violation';
  END IF;

  v_terminal := p_to_status NOT IN ('open', 'under_review');
  IF v_terminal AND COALESCE(length(trim(p_resolution)), 0) < 10 THEN
    RAISE EXCEPTION 'A resolution summary of at least 10 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, category, target_type, target_id, reason,
    before_state, after_state, ip_address, user_agent
  ) VALUES (
    p_admin_user_id,
    CASE WHEN v_terminal THEN 'dispute.' || p_to_status ELSE 'dispute.under_review' END,
    'dispute', 'dispute', p_target_id::text, p_resolution,
    jsonb_build_object('status', v_target.status),
    jsonb_build_object('status', p_to_status, 'resolution_summary', p_resolution),
    p_ip_address, p_user_agent
  ) RETURNING id INTO v_audit_id;

  UPDATE public.disputes
     SET status               = p_to_status,
         resolution_summary   = COALESCE(p_resolution, NULL),
         resolved_by_admin_id = CASE WHEN v_terminal THEN p_admin_user_id ELSE NULL END,
         resolved_at          = CASE WHEN v_terminal THEN NOW() ELSE NULL END,
         admin_audit_log_id   = v_audit_id,
         updated_at           = NOW()
   WHERE id = p_target_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;



-- ============================================================================
-- 4. reports: disposition, atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_report(
    p_admin_user_id   UUID,
    p_target_id       UUID,
    p_to_status       TEXT,
    p_action_taken    TEXT,
    p_ip_address      TEXT DEFAULT NULL,
    p_user_agent      TEXT DEFAULT NULL
)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      public.users%ROWTYPE;
  v_target     public.reports%ROWTYPE;
  v_updated    public.reports%ROWTYPE;
  v_audit_id   UUID;
  v_terminal   BOOLEAN;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id = p_admin_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acting administrator % does not exist', p_admin_user_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_actor.role <> 'admin' OR v_actor.status <> 'active' THEN
    RAISE EXCEPTION 'Acting user % is not an active administrator', p_admin_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_to_status NOT IN ('pending', 'investigating', 'action_taken', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid report status %', p_to_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_target FROM public.reports WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report % not found', p_target_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_target.status = p_to_status THEN
    RAISE EXCEPTION 'This report is already "%"', p_to_status USING ERRCODE = 'check_violation';
  END IF;
  -- Reopening a report that was already acted on would invite acting on it twice.
  IF v_target.status IN ('action_taken', 'dismissed') THEN
    RAISE EXCEPTION 'A closed report cannot be reopened' USING ERRCODE = 'check_violation';
  END IF;

  v_terminal := p_to_status IN ('action_taken', 'dismissed');
  IF v_terminal AND COALESCE(length(trim(p_action_taken)), 0) < 3 THEN
    RAISE EXCEPTION 'Describe the action taken before closing a report'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, category, target_type, target_id, reason,
    before_state, after_state, ip_address, user_agent
  ) VALUES (
    p_admin_user_id, 'report.' || p_to_status, 'report', 'report', p_target_id::text,
    p_action_taken,
    jsonb_build_object('status', v_target.status),
    jsonb_build_object('status', p_to_status, 'action_taken', p_action_taken),
    p_ip_address, p_user_agent
  ) RETURNING id INTO v_audit_id;

  UPDATE public.reports
     SET status               = p_to_status,
         action_taken          = p_action_taken,
         reviewed_by_admin_id  = CASE WHEN v_terminal THEN p_admin_user_id ELSE NULL END,
         reviewed_at           = CASE WHEN v_terminal THEN NOW() ELSE NULL END,
         admin_audit_log_id    = v_audit_id,
         updated_at            = NOW()
   WHERE id = p_target_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;


-- ============================================================================
-- 5. Grants. This is the security boundary for the four functions above.
-- ============================================================================
-- service_role keeps EXECUTE (it holds it from the Supabase default grant and
-- is never revoked), which is what AdminService uses after requireAdmin has
-- already authorized the caller. anon, authenticated and PUBLIC are removed
-- explicitly. The explicit `FROM anon` is not redundant: per 00011, it is the
-- only statement that actually removes the default anon grant.
REVOKE ALL ON FUNCTION public.admin_moderate_user(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_moderate_user(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_moderate_user(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_moderate_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_moderate_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_moderate_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_update_dispute(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_update_dispute(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_update_dispute(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_update_report(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_update_report(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_update_report(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

-- Grant EXECUTE to service_role explicitly rather than relying on the default
-- privilege surviving, so the intended caller set is stated rather than implied.
GRANT EXECUTE ON FUNCTION public.admin_moderate_user(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_moderate_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_dispute(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_report(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

