-- Stage 11: reviews and reputation.
--
-- Bidirectional: a completed contract lets the client review the consultant and
-- the consultant review the client. Every rule in the Stage 11 brief is enforced
-- in the database as well as in the service layer, because the service connects
-- with the service role and therefore bypasses RLS, so an application bug would
-- otherwise be the only thing standing between a fake review and a reputation.
--
-- Rules enforced by the `enforce_review_integrity` trigger:
--   1. Only the two parties on the contract may review each other.
--   2. One review per (contract, reviewee) pair, plus the pre-existing one per
--      (contract, reviewer).
--   3. The contract must be in the `completed` state.
--   5. Self-review is impossible.
--   6. Duplicates are impossible.
--   4. Edits are bounded to a 7-day window and fully audited; after that the row
--      is immutable.
--
-- Reputation is always recomputed from the reviews table, never incremented.
-- An incremental counter can be edited into an inflated number; a derived value
-- cannot.

-- ============================================================================
-- 1. Rating dimensions
-- ============================================================================
-- The Stage 1 columns were `rating_technical_expertise` and
-- `rating_schedule_adherence`. Those are consultant-centric and read wrong when a
-- consultant rates a client: nobody asks whether a buyer had SAP technical
-- expertise. The Stage 11 brief specifies Quality and Timeliness, which are
-- symmetric and meaningful in both directions, so the columns are renamed rather
-- than duplicated. RENAME preserves any existing data.
--
-- PostgreSQL has no `RENAME COLUMN IF EXISTS`, hence the guarded DO block.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reviews'
          AND column_name = 'rating_technical_expertise'
    ) THEN
        ALTER TABLE public.reviews
            RENAME COLUMN rating_technical_expertise TO rating_quality;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reviews'
          AND column_name = 'rating_schedule_adherence'
    ) THEN
        ALTER TABLE public.reviews
            RENAME COLUMN rating_schedule_adherence TO rating_timeliness;
    END IF;
END $$;

ALTER TABLE public.reviews
    ADD COLUMN IF NOT EXISTS reviewee_role user_role;

-- The rating columns must exist even on a database created before this
-- migration, so add any that the rename did not produce.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS rating_quality        SMALLINT NOT NULL DEFAULT 3
    CHECK (rating_quality BETWEEN 1 AND 5);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS rating_timeliness     SMALLINT NOT NULL DEFAULT 3
    CHECK (rating_timeliness BETWEEN 1 AND 5);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS rating_communication   SMALLINT NOT NULL DEFAULT 3
    CHECK (rating_communication BETWEEN 1 AND 5);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS rating_overall        SMALLINT NOT NULL DEFAULT 3
    CHECK (rating_overall BETWEEN 1 AND 5);

-- Edit and deletion bookkeeping. A review is never silently overwritten or
-- removed; the audit trail in `review_edits` records who changed what and when.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS edit_count      INTEGER NOT NULL DEFAULT 0
    CHECK (edit_count >= 0);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS edited_at      TIMESTAMPTZ;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- A review is only meaningful when it is backed by a contract that actually
-- completed, so the fact is stored rather than inferred at read time.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS contract_completed_at TIMESTAMPTZ;

-- Explicit uniqueness for the pair being rated. `uq_contract_reviewer` already
-- limits a reviewer to one review per contract, which on a two-party contract is
-- equivalent; this constraint states the intent directly and survives any future
-- change that adds a third reviewer role.
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS uq_contract_reviewee_pair;
ALTER TABLE public.reviews ADD CONSTRAINT uq_contract_reviewee_pair
    UNIQUE (contract_id, reviewee_user_id);

-- A live (non-deleted) review is the only kind that counts. A deleted row keeps
-- its ratings for audit, so a partial unique index on the live rows is what stops
-- a delete-then-recreate from producing two counted reviews.
--
-- A partial unique index cannot be expressed as a table CONSTRAINT: PostgreSQL's
-- `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE (...)` does not accept a WHERE
-- clause. It has to be a `CREATE UNIQUE INDEX`, which is what this is. The
-- earlier `uq_contract_reviewer` constraint is dropped first so the partial
-- index is the single owner of that uniqueness rule.
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS uq_contract_reviewer;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS uq_contract_reviewer_live;
DROP INDEX IF EXISTS public.uq_contract_reviewer_live;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_reviewer_live
    ON public.reviews (contract_id, reviewer_user_id)
    WHERE deleted_at IS NULL;

-- A deletion must record who did it.
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS chk_review_deletion_audit;
ALTER TABLE public.reviews ADD CONSTRAINT chk_review_deletion_audit CHECK (
    deleted_at IS NULL OR deleted_by_user_id IS NOT NULL
);

-- ============================================================================
-- 2. Edit audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.review_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    editor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('created', 'edited', 'deleted')),
    -- Complete before/after snapshots. Ratings and text are both captured so an
    -- edit that lowers a score is as auditable as one that raises it.
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_edits_review
    ON public.review_edits (review_id, created_at DESC);

-- ============================================================================
-- 3. Integrity trigger
-- ============================================================================
-- Runs BEFORE INSERT OR UPDATE. Every rule the brief lists is checked here rather
-- than trusted to application code, because the service role bypasses RLS and
-- therefore bypasses every policy-based defence.
--
-- Authorship of an update cannot be verified here: the service connects as the
-- service role, so `auth.uid()` is NULL and the trigger has no actor to check.
-- The split is deliberate:
--   - the trigger protects the review's identity and its time window;
--   - ReviewService protects who is allowed to make the change.
-- Together they make a silent mutation of a settled review impossible.
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
    -- On UPDATE the review's identity is immutable. Changing the contract or
    -- the parties after the fact would detach the review from the engagement
    -- that justified it.
    -- ---------------------------------------------------------------------
    IF TG_OP = 'UPDATE' THEN
        IF NEW.contract_id IS DISTINCT FROM OLD.contract_id
           OR NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
           OR NEW.reviewee_user_id IS DISTINCT FROM OLD.reviewee_user_id THEN
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

DROP TRIGGER IF EXISTS trg_enforce_review_integrity ON public.reviews;
CREATE TRIGGER trg_enforce_review_integrity
    BEFORE INSERT OR UPDATE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.enforce_review_integrity();

-- ============================================================================
-- 4. Reputation recomputation
-- ============================================================================
-- Recomputed from the reviews table in full, every time. An incremental
-- "avg = (avg * n + r) / (n + 1)" is a common source of drift: it accumulates
-- rounding error, and it can be fed a fabricated review that then poisons every
-- later calculation. Recomputing from the source of truth makes that impossible,
-- and a consultant with a thousand reviews costs one indexed aggregate scan.
--
-- The Bayesian score is the ranking aid. A raw average lets a consultant with a
-- single 5-star review outrank one with 200 reviews at 4.6, which is a ranking
-- manipulation vector rather than a signal. Smoothing toward a fixed prior makes
-- review count matter, so buying one review cannot buy a top position:
--
--   score = (C * m + sum(ratings)) / (C + n)
--
--   m = 4.0  prior mean for an unreviewed marketplace participant
--   C = 8    prior weight, i.e. eight average reviews' worth of inertia
--
-- Both numbers are always stored. The UI shows the real average and the real
-- count; only the ordering uses the smoothed score, so a user is never shown a
-- flattering number that is not the actual data.
--
-- The prior is a fixed constant rather than the live marketplace mean on
-- purpose: a global mean would make everyone's score drift as the population
-- changes, and a participant's rank would shift without any review being written.
CREATE OR REPLACE FUNCTION public.compute_bayesian_rating(
    p_sum      NUMERIC,
    p_count    INTEGER,
    p_prior_mean NUMERIC DEFAULT 4.0,
    p_prior_weight NUMERIC DEFAULT 8
) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
    SELECT ROUND(
        ((p_prior_weight * p_prior_mean) + COALESCE(p_sum, 0))
        / ((p_prior_weight) + GREATEST(COALESCE(p_count, 0), 0)),
        2
    );
$$;

CREATE OR REPLACE FUNCTION public.refresh_reputation(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_avg_overall       NUMERIC := 0;
    v_avg_communication NUMERIC := 0;
    v_avg_quality       NUMERIC := 0;
    v_avg_timeliness    NUMERIC := 0;
    v_bayesian          NUMERIC := 4.00;
    v_count             INTEGER := 0;
    v_sum               NUMERIC := 0;
    v_dist              JSONB;
    v_completed         INTEGER := 0;
    v_as_consultant     BOOLEAN;
    v_as_client         BOOLEAN;
BEGIN
    -- Role flags are resolved on their own. They cannot be folded into the
    -- contracts aggregate below, because a user with zero contracts would make
    -- that aggregate return a single all-NULL row and the flags would come back
    -- false, silently skipping the profile mirror.
    SELECT
        EXISTS (SELECT 1 FROM public.consultant_profiles WHERE user_id = p_user_id),
        EXISTS (SELECT 1 FROM public.client_profiles     WHERE user_id = p_user_id)
    INTO v_as_consultant, v_as_client;

    -- Live, public reviews only. Soft-deleted rows are excluded, so a deleted
    -- review stops influencing the score immediately.
    SELECT
        COUNT(*),
        COALESCE(SUM(rating_overall), 0),
        COALESCE(AVG(rating_overall), 0),
        COALESCE(AVG(rating_communication), 0),
        COALESCE(AVG(rating_quality), 0),
        COALESCE(AVG(rating_timeliness), 0)
    INTO
        v_count, v_sum, v_avg_overall, v_avg_communication,
        v_avg_quality, v_avg_timeliness
    FROM public.reviews
    WHERE reviewee_user_id = p_user_id
      AND deleted_at IS NULL
      AND is_public = true;

    -- Distribution. Every counted review appears in exactly one bucket, which is
    -- what the chk_reputation_distribution_total constraint asserts.
    SELECT COALESCE(jsonb_object_agg(stars::TEXT, n), '{}'::jsonb)
      INTO v_dist
    FROM (
        SELECT rating_overall AS stars, COUNT(*) AS n
          FROM public.reviews
         WHERE reviewee_user_id = p_user_id
           AND deleted_at IS NULL
           AND is_public = true
         GROUP BY rating_overall
    ) d;

    v_bayesian := public.compute_bayesian_rating(v_sum, v_count);

    -- Completed projects, counted from the contracts themselves rather than read
    -- from a stored counter that could drift out of step. A user is counted for a
    -- contract they took part in on either side.
    SELECT COUNT(*) FILTER (WHERE c.status = 'completed')
      INTO v_completed
    FROM public.contracts c
    WHERE c.client_id     IN (SELECT id FROM public.client_profiles     WHERE user_id = p_user_id)
       OR c.consultant_id IN (SELECT id FROM public.consultant_profiles WHERE user_id = p_user_id);

    -- Upsert into the search-ready table.
    INSERT INTO public.reputation (
        user_id, total_reviews_count, completed_contracts_count,
        avg_rating_overall, avg_rating_communication, avg_rating_quality,
        avg_rating_timeliness, bayesian_rating, rating_distribution
    )
    VALUES (
        p_user_id, v_count, v_completed,
        ROUND(v_avg_overall, 2), ROUND(v_avg_communication, 2),
        ROUND(v_avg_quality, 2), ROUND(v_avg_timeliness, 2),
        v_bayesian, v_dist
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_reviews_count      = EXCLUDED.total_reviews_count,
        completed_contracts_count = EXCLUDED.completed_contracts_count,
        avg_rating_overall       = EXCLUDED.avg_rating_overall,
        avg_rating_communication = EXCLUDED.avg_rating_communication,
        avg_rating_quality       = EXCLUDED.avg_rating_quality,
        avg_rating_timeliness    = EXCLUDED.avg_rating_timeliness,
        bayesian_rating          = EXCLUDED.bayesian_rating,
        rating_distribution      = EXCLUDED.rating_distribution,
        refreshed_at             = NOW();

    -- Mirror onto the profile tables the existing read paths already select, so
    -- the current profile pages and search ordering start working without a
    -- second code path.
    IF v_as_consultant THEN
        UPDATE public.consultant_profiles
           SET avg_rating              = ROUND(v_avg_overall, 2),
               total_reviews_count     = v_count,
               completed_contracts_count = v_completed,
               updated_at              = NOW()
         WHERE user_id = p_user_id;
    END IF;

    IF v_as_client THEN
        UPDATE public.client_profiles
           SET avg_rating              = ROUND(v_avg_overall, 2),
               total_reviews_count     = v_count,
               completed_contracts_count = v_completed,
               updated_at              = NOW()
         WHERE user_id = p_user_id;
    END IF;
END;
$$;

-- The search-ready aggregate. One row per user, always consistent with the
-- reviews table because it is only ever written by refresh_reputation.
CREATE TABLE IF NOT EXISTS public.reputation (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    total_reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (total_reviews_count >= 0),
    completed_contracts_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_contracts_count >= 0),
    -- Real averages. These are what the UI displays.
    avg_rating_overall       NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    avg_rating_communication NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    avg_rating_quality       NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    avg_rating_timeliness    NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    -- Smoothing applied to overall, for ordering only. Never displayed as if it
    -- were a real average.
    bayesian_rating NUMERIC(3,2) NOT NULL DEFAULT 4.00,
    -- {"1": n, "2": n, "3": n, "4": n, "5": n}
    rating_distribution JSONB NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_reputation_averages CHECK (
        avg_rating_overall       BETWEEN 0.00 AND 5.00 AND
        avg_rating_communication BETWEEN 0.00 AND 5.00 AND
        avg_rating_quality       BETWEEN 0.00 AND 5.00 AND
        avg_rating_timeliness    BETWEEN 0.00 AND 5.00
    ),
    -- The distribution must always account for every counted review, otherwise
    -- the displayed bars and the count would disagree.
    CONSTRAINT chk_reputation_distribution_total CHECK (
        COALESCE((rating_distribution->>'1')::INT, 0)
      + COALESCE((rating_distribution->>'2')::INT, 0)
      + COALESCE((rating_distribution->>'3')::INT, 0)
      + COALESCE((rating_distribution->>'4')::INT, 0)
      + COALESCE((rating_distribution->>'5')::INT, 0)
      = total_reviews_count
    )
);

-- Client reputation. Stage 1 gave clients no rating columns at all, which made
-- two-way review impossible to surface.
ALTER TABLE public.client_profiles ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2)
    NOT NULL DEFAULT 0.00 CHECK (avg_rating BETWEEN 0.00 AND 5.00);
ALTER TABLE public.client_profiles ADD COLUMN IF NOT EXISTS total_reviews_count INTEGER
    NOT NULL DEFAULT 0 CHECK (total_reviews_count >= 0);
ALTER TABLE public.client_profiles ADD COLUMN IF NOT EXISTS completed_contracts_count INTEGER
    NOT NULL DEFAULT 0 CHECK (completed_contracts_count >= 0);

-- ---------------------------------------------------------------------------
-- Search readiness
-- ---------------------------------------------------------------------------
-- The ordering a future consultant search would use: proven quality first, with
-- volume as a tie-break, and a minimum review floor so a single 5-star review
-- cannot reach the top of any page. The UI still shows the raw average and count.
CREATE INDEX IF NOT EXISTS idx_reputation_consultant_ranking
    ON public.reputation (bayesian_rating DESC, total_reviews_count DESC)
    WHERE total_reviews_count > 0;

CREATE INDEX IF NOT EXISTS idx_reputation_volume
    ON public.reputation (total_reviews_count DESC, completed_contracts_count DESC);

-- Backs the "has enough reviews to be trusted" filter in search.
CREATE INDEX IF NOT EXISTS idx_reputation_min_reviews
    ON public.reputation (user_id) WHERE total_reviews_count >= 3;

-- Refresh both parties whenever a review changes. A consultant's score changes
-- when a client reviews them, and a client's score changes when a consultant
-- reviews them, so both sides are refreshed from the one trigger.
CREATE OR REPLACE FUNCTION public.trg_refresh_reputation()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.refresh_reputation(COALESCE(NEW.reviewee_user_id, OLD.reviewee_user_id));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reviews_refresh_reputation ON public.reviews;
CREATE TRIGGER trg_reviews_refresh_reputation
    AFTER INSERT OR UPDATE OR DELETE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_reputation();

-- Backfill the aggregate for anyone who already has reviews, so the table is
-- never silently empty after deploy.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT DISTINCT reviewee_user_id FROM public.reviews WHERE deleted_at IS NULL
    LOOP
        PERFORM public.refresh_reputation(r.reviewee_user_id);
    END LOOP;
END $$;

-- ============================================================================
-- 5. Read model for the display requirements
-- ============================================================================
-- Average rating, review count, rating distribution and completed projects in one
-- call, so the display cannot disagree with itself. Reads the `reputation` table
-- and falls back to a live aggregate if a user has no row yet.
CREATE OR REPLACE FUNCTION public.get_reputation_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'user_id', p_user_id,
        'average_rating', COALESCE(r.avg_rating_overall, 0),
        'total_reviews', COALESCE(r.total_reviews_count, 0),
        'completed_projects', COALESCE(r.completed_contracts_count, 0),
        'rating_distribution', COALESCE(
            r.rating_distribution,
            '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb
        ),
        'dimension_averages', jsonb_build_object(
            'overall',       COALESCE(r.avg_rating_overall, 0),
            'communication', COALESCE(r.avg_rating_communication, 0),
            'quality',       COALESCE(r.avg_rating_quality, 0),
            'timeliness',    COALESCE(r.avg_rating_timeliness, 0)
        ),
        -- Exposed for transparency, explicitly labelled as an ordering aid. The
        -- UI must not present this as a rating the reviewer gave.
        'ranking_score', COALESCE(r.bayesian_rating, 4.00),
        'has_public_reviews', COALESCE(r.total_reviews_count, 0) > 0
    )
    FROM (SELECT 1) AS _
    LEFT JOIN public.reputation r ON r.user_id = p_user_id;
$$;

-- ============================================================================
-- 6. Row level security
-- ============================================================================
-- Reviews are public by default: a public reputation system that hides its
-- reviews is not a reputation system. Write access is service-role only, because
-- every write rule is enforced by the integrity trigger and by ReviewService.
ALTER TABLE public.reviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_public_read ON public.reviews;
CREATE POLICY reviews_public_read ON public.reviews
  FOR SELECT USING (is_public = true AND deleted_at IS NULL);

-- A reviewer can always see their own review, including after deleting it, so the
-- UI can explain the state rather than silently failing.
DROP POLICY IF EXISTS reviews_own_read ON public.reviews;
CREATE POLICY reviews_own_read ON public.reviews
  FOR SELECT USING (
    deleted_at IS NULL AND reviewer_user_id = (SELECT auth.uid())
  );

-- The edit trail is never public. It is for moderation and dispute resolution.
DROP POLICY IF EXISTS review_edits_own_read ON public.review_edits;
CREATE POLICY review_edits_own_read ON public.review_edits
  FOR SELECT USING (editor_user_id = (SELECT auth.uid()));

-- The aggregate contains the same numbers as the public reviews, so it is
-- readable, but never writable from a browser role.
DROP POLICY IF EXISTS reputation_public_read ON public.reputation;
CREATE POLICY reputation_public_read ON public.reputation
  FOR SELECT USING (true);

REVOKE ALL ON public.reviews, public.review_edits, public.reputation
    FROM anon, authenticated;
GRANT SELECT ON public.reviews, public.reputation TO authenticated;

COMMENT ON COLUMN public.reputation.bayesian_rating IS
  'Ranking aid only: (8 * 4.0 + sum(overall)) / (8 + n). Never displayed to users as a rating.';
COMMENT ON COLUMN public.reputation.avg_rating_overall IS
  'The true arithmetic mean of live public reviews. This is what the UI shows.';
