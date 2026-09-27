-- ============================================================================
-- 00012_reviews_reputation_remediation.sql
--
-- Stage 11 remediation for the findings raised by the independent Stage 11
-- audit. Additive and self-contained: 00010 is left untouched so that a database
-- which has already applied it converges on the same state as a fresh one.
--
-- Fixes, in the order the audit ranked them:
--   H2  reviews.reviewee_user_id had no usable index, so every review write
--       (via the reputation trigger) and every review listing was a sequential
--       scan.
--   M2  the integrity trigger froze contract_id, reviewer_user_id and
--       reviewee_user_id on UPDATE, but left reviewer_role, reviewee_role and
--       contract_completed_at mutable.
--   M1  the 7-day window covered ratings, text and visibility but not
--       deleted_at, so an author withdrawing their own review was not bound by
--       it at the database level.
--   H1  every function in 00010 inherited Supabase's default privilege of
--       GRANT ALL ... TO anon, so `REVOKE ... FROM PUBLIC` alone (the pattern
--       used in 00003/00006/00007/00008/00009) would not have removed the
--       explicit anon grant. See 00011 for the live proof of that behaviour.
--   M3  `review_edits` had a SELECT policy but no matching grant, so the policy
--       was unreachable.
--
-- Nothing here weakens a Stage 11 control. The rating CHECKs, the self-review
-- CHECK, the party/contract/role validation on INSERT, the duplicate
-- prevention, and the "aggregates are recomputed from reviews" guarantee are all
-- carried forward unchanged.
-- ============================================================================

-- ============================================================================
-- 1. H2 — index the reviewee
-- ============================================================================
-- The two unique indexes that exist are (contract_id, reviewee_user_id) and
-- (contract_id, reviewer_user_id). Neither has reviewee_user_id as its leading
-- column, so a predicate of `WHERE reviewee_user_id = ?` cannot use either and
-- falls back to a sequential scan. Every read of the form
--
--   SELECT ... FROM reviews WHERE reviewee_user_id = $1
--     AND deleted_at IS NULL AND is_public = true
--
-- needs this index, and it is on the write path too: the AFTER trigger runs
-- refresh_reputation inside every review INSERT/UPDATE/DELETE, and that function
-- aggregates on exactly this predicate.
--
-- Partial on live rows, because every legitimate query filters
-- `deleted_at IS NULL` (the aggregate, the public listing and the reputation
-- read model all do). Soft-deleted rows are retained only for audit, and keeping
-- them out of the index keeps it small without affecting any of those reads.
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_live
    ON public.reviews (reviewee_user_id)
    WHERE deleted_at IS NULL;

-- The same predicate is used when ordering a user's reviews by date, so the
-- created_at column is carried to keep that read index-only.
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_live_recent
    ON public.reviews (reviewee_user_id, created_at DESC)
    WHERE deleted_at IS NULL AND is_public = true;

-- ============================================================================
-- 2. M1 + M2 — tighten the integrity trigger
-- ============================================================================
-- CREATE OR REPLACE rather than editing 00010, so the definition lives in one
-- place for a fresh database and the change is replayable on an existing one.
--
-- M2 adds three identity fields to the immutability check. All three are set by
-- this trigger on INSERT from the contract's real parties (see the tail of the
-- function), so a later UPDATE that changed them could only ever be an attempt
-- to rewrite who a review was attributed to. Ratings, feedback_markdown,
-- is_public, edit_count and edited_at stay mutable: those are the legitimate
-- amendable fields, and edit_count/edited_at are bookkeeping the service owns.
-- deleted_by_user_id and deletion_reason stay settable because they are how a
-- deletion records itself.
--
-- M1 extends the window to an author withdrawing their own review. The check is
-- deliberately conditioned on `deleted_by_user_id = reviewer_user_id`: that is
-- precisely the distinction ReviewService.deleteReview draws, where an author
-- is bound by the window but a moderator removing someone else's review is not.
-- Enforcing the window unconditionally here would have broken administrator
-- moderation, because this function is SECURITY INVOKER and runs as the service
-- role, so auth.uid() is NULL and the trigger cannot tell who asked.
CREATE OR REPLACE FUNCTION public.enforce_review_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_client_id      UUID;
    v_consultant_id  UUID;
    v_client_user    UUID;
    v_consultant_user UUID;
    v_actual_role    user_role;
    v_counterpart    UUID;
    v_counterpart_role user_role;
    v_review_window  INTERVAL := INTERVAL '7 days';
BEGIN
    -- ---------------------------------------------------------------------
    -- On UPDATE the review's identity is immutable.
    -- ---------------------------------------------------------------------
    IF TG_OP = 'UPDATE' THEN
        IF NEW.contract_id IS DISTINCT FROM OLD.contract_id
           OR NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
           OR NEW.reviewee_user_id IS DISTINCT FROM OLD.reviewee_user_id
           -- M2: derived identity. Set from the contract on INSERT, so they
           -- describe what the review always was, not a mutable claim.
           OR NEW.reviewer_role IS DISTINCT FROM OLD.reviewer_role
           OR NEW.reviewee_role IS DISTINCT FROM OLD.reviewee_role
           OR NEW.contract_completed_at IS DISTINCT FROM OLD.contract_completed_at THEN
            RAISE EXCEPTION
                'A review cannot be reassigned to a different contract or party.'
                USING ERRCODE = 'check_violation';
        END IF;

        -- Rule 4: bounded edit window. After it closes the review is immutable,
        -- so a rating cannot be revised months later to reshape a profile.
        IF OLD.created_at < NOW() - v_review_window
           AND (NEW.rating_overall        IS DISTINCT FROM OLD.rating_overall
             OR NEW.rating_communication  IS DISTINCT FROM OLD.rating_communication
             OR NEW.rating_quality        IS DISTINCT FROM OLD.rating_quality
             OR NEW.rating_timeliness     IS DISTINCT FROM OLD.rating_timeliness
             OR NEW.feedback_markdown     IS DISTINCT FROM OLD.feedback_markdown
             OR NEW.is_public             IS DISTINCT FROM OLD.is_public) THEN
            RAISE EXCEPTION
                'This review is past the %s edit window and can no longer be changed.',
                v_review_window
                USING ERRCODE = 'check_violation';
        END IF;

        -- M1: the same window applies when the author withdraws their own
        -- review. A moderator deleting someone else's review is exempt, which
        -- is the only reason this is not a blanket window on deleted_at.
        IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
           AND OLD.created_at < NOW() - v_review_window
           AND NEW.deleted_by_user_id = OLD.reviewer_user_id THEN
            RAISE EXCEPTION
                'This review is past the %s withdrawal window and can no longer be deleted by its author.',
                v_review_window
                USING ERRCODE = 'check_violation';
        END IF;

        -- Soft deletion is one-way. A deleted review cannot be resurrected,
        -- otherwise the "one live review per contract" guarantee is meaningless.
        IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            RAISE EXCEPTION
                'A deleted review cannot be restored.'
                USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
    END IF;

    -- ---------------------------------------------------------------------
    -- INSERT
    -- ---------------------------------------------------------------------
    -- Rule 5: no self-review, at the database level.
    IF NEW.reviewer_user_id = NEW.reviewee_user_id THEN
        RAISE EXCEPTION 'A user cannot review themselves.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Rules 1 and 3: resolve the contract's two parties and their users.
    SELECT cp.id, cp.user_id, con.user_id, con.id
      INTO v_client_id, v_client_user, v_consultant_user, v_consultant_id
      FROM public.contracts c
      JOIN public.client_profiles     cp  ON cp.id  = c.client_id
      JOIN public.consultant_profiles con ON con.id = c.consultant_id
     WHERE c.id = NEW.contract_id;

    IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'Contract % does not exist or has no resolvable parties.', NEW.contract_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Rule 3: a review requires a genuinely completed contract.
    IF NOT EXISTS (
        SELECT 1 FROM public.contracts
         WHERE id = NEW.contract_id AND status = 'completed'
    ) THEN
        RAISE EXCEPTION
            'Reviews can only be left on a completed contract.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Rule 1: the reviewer must be one of the two parties...
    IF NEW.reviewer_user_id <> v_client_user AND NEW.reviewer_user_id <> v_consultant_user THEN
        RAISE EXCEPTION
            'Only the client or the consultant on this contract may leave a review.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ...and the reviewee must be the other one, not an arbitrary third party.
    IF NEW.reviewer_user_id = v_client_user THEN
        v_counterpart := v_consultant_user;
        v_actual_role := 'client';
        v_counterpart_role := 'consultant';
    ELSE
        v_counterpart := v_client_user;
        v_actual_role := 'consultant';
        v_counterpart_role := 'client';
    END IF;

    IF NEW.reviewee_user_id <> v_counterpart THEN
        RAISE EXCEPTION
            'The party being reviewed must be the other party on this contract.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- The recorded role must be the reviewer's real role, so a client cannot
    -- pass themselves off as a consultant to skew a consultant-side aggregate.
    IF NEW.reviewer_role <> v_actual_role THEN
        RAISE EXCEPTION 'The recorded reviewer role does not match this user''s role.'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.reviewee_role := v_counterpart_role;
    NEW.contract_completed_at := NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CREATE OR REPLACE keeps the trigger bound to the function OID, so the
-- existing trigger continues to fire against the new body. The DROP/CREATE pair
-- is issued anyway so the statement is explicit and idempotent.
DROP TRIGGER IF EXISTS trg_enforce_review_integrity ON public.reviews;
CREATE TRIGGER trg_enforce_review_integrity
    BEFORE INSERT OR UPDATE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.enforce_review_integrity();

-- ============================================================================
-- 3. H1 — function execution is service-role only
-- ============================================================================
-- Why REVOKE ... FROM PUBLIC is not enough here.
--
-- Supabase provisions the project with a default privilege equivalent to
--     GRANT ALL ON ALL FUNCTIONS IN SCHEMA public
--       TO postgres, anon, authenticated, service_role
-- That is an EXPLICIT grant to `anon`. `REVOKE ... FROM PUBLIC` only removes the
-- implicit grant every role inherits from the PUBLIC pseudo-role, so on this
-- platform it leaves the anon grant in place. 00011 documents the live
-- confirmation: an unauthenticated POST to /rest/v1/rpc/create_contract_for_proposal
-- reached the function body and executed its authorization branch.
--
-- The consequence for Stage 11 is concrete. `refresh_reputation` is SECURITY
-- DEFINER and writes to public.reputation, public.consultant_profiles and
-- public.client_profiles — the last two of which migration 00005 revoked
-- INSERT/UPDATE/DELETE from anon and authenticated. Left callable by anon, it is
-- a remote unauthenticated path to perform writes on tables the browser roles
-- were explicitly denied, once per request, each one a full recompute.
--
-- The values themselves cannot be falsified: the function recomputes from the
-- reviews table rather than accepting a rating. The exposure is a privilege
-- boundary bypass and an amplification vector, not a way to invent reputation.
--
-- Revoked from anon, authenticated and PUBLIC. `service_role` keeps EXECUTE (it
-- is a table owner-level role that bypasses grants and RLS, and it is the only
-- caller: the AFTER trigger). Revoked from `authenticated` too, because no
-- browser session may drive a recompute for an arbitrary user id; the public
-- read path is `GET /api/reputation/<userId>`, which is a server endpoint.
--
-- Guarded by an existence check so this migration is safe to apply whether or
-- not 00010 has already run in the target database.
DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS signature
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (
               'refresh_reputation',
               'get_reputation_summary',
               'enforce_review_integrity',
               'trg_refresh_reputation'
           )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.signature);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.signature);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);
    END LOOP;
END $$;

-- `compute_bayesian_rating` is deliberately NOT revoked. It is a pure IMMUTABLE
-- arithmetic function over four scalars, holds no data, and touches no table.
-- Leaving it callable is harmless and avoids a pointless grant asymmetry.

-- ============================================================================
-- 4. M3 — make the review_edits policy reachable
-- ============================================================================
-- 00010 created `review_edits_own_read` allowing an author to read the edit
-- history of their own reviews, but then revoked ALL from anon and authenticated
-- and only granted SELECT back on `reviews` and `reputation`. A policy is not a
-- grant: without the table privilege the policy can never be exercised, so the
-- audit trail behind rules 4 and 7 was unreadable by every role below
-- service_role.
--
-- The grant is deliberately narrow and matches the policy exactly: authenticated
-- users may SELECT review_edits, and RLS then admits only rows where
-- editor_user_id = auth.uid(). They still cannot see another user's history,
-- cannot insert, cannot update, and cannot delete.
--
-- Moderation over the whole trail stays with service_role, which bypasses both
-- the grant and RLS.
GRANT SELECT ON public.review_edits TO authenticated;

-- Belt and braces: restate the policy so its intended shape is explicit even if
-- a future migration renames or drops it.
DROP POLICY IF EXISTS review_edits_own_read ON public.review_edits;
CREATE POLICY review_edits_own_read ON public.review_edits
  FOR SELECT USING (editor_user_id = (SELECT auth.uid()));

-- 00010's comment on `reviews_own_read` states that a reviewer can see their own
-- review "including after deleting it", but the policy it describes contains
-- `deleted_at IS NULL` and therefore does the opposite. The policy is correct —
-- a withdrawn review should vanish from every read path — so only the comment is
-- wrong. Corrected here rather than by editing 00010, which may already have been
-- applied elsewhere.
COMMENT ON POLICY reviews_own_read ON public.reviews IS
  'Lets a reviewer read their own live review. A soft-deleted review is NOT visible here: the policy requires deleted_at IS NULL, so a withdrawn review disappears from every read path, matching its exclusion from the reputation aggregate.';

-- ============================================================================
-- 5. Follow-up deliberately NOT done here
-- ============================================================================
-- ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM anon would stop
-- this recurring for every function added from now on. It is not applied here
-- because 00011 established that revoking anon from the RLS authorization
-- helpers (is_client_profile_owner, is_consultant_profile_owner,
-- can_access_contract, is_conversation_member) turns an anonymous row-filtering
-- query into a permission error: those functions are evaluated inside RLS
-- policies and therefore run as the querying role. They derive everything from
-- auth.uid(), which is NULL for anon, so they can only return false and disclose
-- nothing. Narrowing the default to exclude only state-changing functions, or
-- re-granting the helpers afterwards, is a project-wide decision rather than
-- Stage 11 remediation.
--
-- `get_reputation_summary` is retained rather than dropped. It is currently
-- unreferenced by the application, but it is a legitimate read-only database
-- API over the same data the `reputation` table already exposes to
-- authenticated, and it is now unreachable by anon like the rest. Removing a
-- public SQL interface is a larger change than securing it, so it is secured.
--
-- Re-seeding the aggregate is unnecessary: 00010's backfill and the
-- trg_reviews_refresh_reputation trigger already populate `reputation` for every
-- review that exists, and the two new indexes are built concurrently with
-- ordinary CREATE INDEX IF NOT EXISTS, which takes a write lock only briefly and
-- on a table with no existing rows on a fresh database.
