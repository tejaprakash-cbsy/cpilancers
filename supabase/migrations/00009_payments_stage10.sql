-- Stage 10: marketplace payments, escrow ledger and payouts.
--
-- Scope: Stage 10 is deliberately BACKEND-ONLY. It provides the escrow ledger,
-- the Razorpay Route provider adapter, the payment/payout API surface and the
-- webhook receiver. It ships NO user interface: no page, component or
-- client-api.service.ts method is added, so nothing in src/app or src/components
-- calls /api/payments or /api/payouts yet. Opening Razorpay Checkout, the
-- funding panel and the payout tracker are a separate UI stage. This is a scope
-- decision, not an omission, and is recorded here so the absence of UI is not
-- later mistaken for an unfinished feature.
--
-- Provider decision: Razorpay Route, India only.
-- Stripe Connect is NOT available in India (stripe.com/global lists India as
-- "Preview" and invite-only; India is absent from the separate-charges-and-
-- transfers region list), so the Stage 1 schema's stripe_* columns are remapped
-- onto Razorpay primitives rather than implemented against a provider that
-- cannot settle INR.
--
-- Razorpay primitive mapping (all verified against razorpay.com/docs):
--   Stripe concept            -> Razorpay concept
--   PaymentIntent             -> Order (order_...) + Payment (pay_...)
--   Charge                    -> (none; the payment IS the charge)
--   Transfer (Connect)        -> Transfer (trf_...)  1:1
--   Payout (bank debit)       -> Settlement (setl_...) via recipient_settlement_id
--   Connected account         -> Linked Account (acc_...)
--
-- Escrow model: Razorpay caps manual capture at 7200 minutes (5 days) and
-- auto-refunds uncaptured payments after that window, so an "authorized"
-- payment cannot be a long-lived escrow state. Instead the payment is captured
-- immediately and the escrow hold lives on the Route transfer via on_hold.
-- Release is transfers.edit(id, { on_hold: false }).

-- ============================================================================
-- 1. Provider remap: stripe_* -> razorpay_*
-- ============================================================================
-- payments.stripe_payment_intent_id has no Razorpay analogue. An order and a
-- payment are separate objects in Razorpay, so the single column is split.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT UNIQUE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT UNIQUE;

-- The provider a ledger row belongs to. Keeps the ledger portable if a second
-- provider is ever added; the Stage 10 code paths are all provider-scoped.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'razorpay';

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT;

-- A transfer is created the moment funds are escrowed, so the payout row can be
-- written in the same transaction and its provider id is known immediately.
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS razorpay_transfer_id TEXT UNIQUE;

-- Razorpay Route has no per-recipient "payout" object. Settlement of a transfer
-- is tracked through recipient_settlement_id (setl_...) and the settlement_status
-- on the transfer, so that column is what replaces the old stripe_payout_id.
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS razorpay_settlement_id TEXT;

ALTER TABLE public.consultant_profiles ADD COLUMN IF NOT EXISTS razorpay_account_id TEXT UNIQUE;

-- Route settles only in INR. Any row created under the old USD default would be
-- unpayable, so the default is corrected for new rows.
ALTER TABLE public.payments ALTER COLUMN currency SET DEFAULT 'INR';
ALTER TABLE public.payouts  ALTER COLUMN currency SET DEFAULT 'INR';

-- M-2: a bare `ADD CONSTRAINT ... CHECK (currency = 'INR')` aborts the entire
-- migration if even one legacy row still carries the Stage 1 'USD' default,
-- because the new constraint is validated against existing data immediately.
-- This migration must therefore be safe against a non-empty environment, not
-- only against the currently-empty one. Normalise first, then constrain.
--
-- This is a deliberate, visible conversion rather than a silent one: a row that
-- held a non-INR currency is moved to INR so it is payable. No payment row is
-- created or deleted by this statement.
UPDATE public.payments SET currency = 'INR' WHERE currency IS DISTINCT FROM 'INR';
UPDATE public.payouts  SET currency = 'INR' WHERE currency IS DISTINCT FROM 'INR';

-- Route requires INR end to end; enforce it rather than trusting callers.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_currency_inr;
ALTER TABLE public.payments ADD CONSTRAINT payments_currency_inr CHECK (currency = 'INR');

ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_currency_inr;
ALTER TABLE public.payouts ADD CONSTRAINT payouts_currency_inr CHECK (currency = 'INR');

-- The retired Stripe columns are kept for one release so that a rollback does not
-- lose the pre-migration data, but they are no longer part of the write path.
COMMENT ON COLUMN public.payments.stripe_payment_intent_id IS
  'DEPRECATED: unused since Stage 10 moved to Razorpay. Kept for rollback only; the application never reads or writes it.';
COMMENT ON COLUMN public.payments.stripe_charge_id IS
  'DEPRECATED: unused since Stage 10 moved to Razorpay. Razorpay has no separate charge object.';
COMMENT ON COLUMN public.payouts.stripe_payout_id IS
  'DEPRECATED: unused since Stage 10 moved to Razorpay. Razorpay Route has no payout object; see razorpay_settlement_id.';
COMMENT ON COLUMN public.consultant_profiles.stripe_connect_account_id IS
  'DEPRECATED: unused since Stage 10 moved to Razorpay. See razorpay_account_id.';

-- ============================================================================
-- 2. Idempotency ledger for webhooks
-- ============================================================================
-- Razorpay delivers at-least-once and retries a non-2xx response for 24 hours on
-- an exponential backoff, after which the endpoint is disabled outright. Every
-- event must therefore be recorded before it is processed so a redelivery after
-- a crash between "apply" and "acknowledge" is a no-op.
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'razorpay',
    -- Razorpay guarantees x-razorpay-event-id is unique per event.
    provider_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    -- 'received' | 'processed' | 'ignored' | 'failed'
    processing_status TEXT NOT NULL DEFAULT 'received'
      CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
    -- The order/payment/transfer this event resolved to, when one was matched.
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    last_error TEXT,
    -- Raw payload retained for disputes and reconciliation. Razorpay payloads can
    -- contain PII, so this table is never exposed to a browser role.
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_webhook_provider_event UNIQUE (provider, provider_event_id)
);

-- The insert that wins this unique index is the one that gets to process. A
-- redelivery hits the constraint and is short-circuited by the application.
-- (No separate index is created here: the UNIQUE constraint above already
-- provides the index, and a second one would double the write cost of every
-- webhook received.)

CREATE INDEX IF NOT EXISTS idx_payment_webhook_payment
    ON public.payment_webhook_events (payment_id)
    WHERE payment_id IS NOT NULL;

-- Events still awaiting a terminal status, for a reconciliation sweep after a
-- crash. Anything left in 'received' past the retry window never completed.
CREATE INDEX IF NOT EXISTS idx_payment_webhook_pending
    ON public.payment_webhook_events (received_at)
    WHERE processing_status IN ('received', 'failed');

-- ============================================================================
-- 3. Refund ledger
-- ============================================================================
-- payments.refunded_at alone cannot express a partial refund, a pending refund
-- or a failed one. Refunds are pre-funded from the merchant's Razorpay balance
-- rather than netted from the original payment, so a refund that is accepted by
-- the API has not necessarily reached the client.
CREATE TABLE IF NOT EXISTS public.payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    provider_refund_id TEXT UNIQUE,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    -- pending | processed | failed
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'processed', 'failed')),
    -- normal | optimum
    speed TEXT CHECK (speed IS NULL OR speed IN ('normal', 'optimum')),
    reason TEXT,
    failure_reason TEXT,
    initiated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    -- A transfer reversal is required when funds already reached the consultant.
    transfer_reversal_id TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON public.payment_refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status   ON public.payment_refunds (status);

-- ============================================================================
-- 4. Platform fee configuration (server-side only)
-- ============================================================================
-- The fee is never accepted from a browser. It is resolved from this table at
-- charge time and frozen onto the payment row, so a later config change cannot
-- retroactively alter what a consultant is owed.
CREATE TABLE IF NOT EXISTS public.platform_fee_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Null scope applies to every payment; a row with a contract_id or a
    -- milestone_id overrides the broader row.
    scope TEXT NOT NULL DEFAULT 'global'
      CHECK (scope IN ('global', 'contract', 'milestone')),
    contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE CASCADE,
    -- Basis points: 1000 = 10.00%. Applied to the authoritative gross.
    basis_points INTEGER NOT NULL DEFAULT 0 CHECK (basis_points >= 0 AND basis_points <= 10000),
    -- Added to the percentage component.
    fixed_cents BIGINT NOT NULL DEFAULT 0 CHECK (fixed_cents >= 0),
    -- Clamp the computed fee so a single large milestone cannot exceed these.
    min_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (min_fee_cents >= 0),
    max_fee_cents BIGINT CHECK (max_fee_cents IS NULL OR max_fee_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_fee_config_scope CHECK (
        (scope = 'global'   AND contract_id IS NULL AND milestone_id IS NULL) OR
        (scope = 'contract' AND contract_id IS NOT NULL AND milestone_id IS NULL) OR
        (scope = 'milestone' AND milestone_id IS NOT NULL)
    ),
    -- max must not be below min, otherwise the clamp is incoherent.
    CONSTRAINT chk_fee_config_max_gte_min CHECK (max_fee_cents IS NULL OR max_fee_cents >= min_fee_cents)
);

-- At most one active row per scope target. The partial unique index is what makes
-- fee resolution deterministic: there can never be two competing winners.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_config_global
    ON public.platform_fee_config (scope) WHERE scope = 'global' AND is_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_config_contract
    ON public.platform_fee_config (contract_id) WHERE scope = 'contract' AND is_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_config_milestone
    ON public.platform_fee_config (milestone_id) WHERE scope = 'milestone' AND is_active;

-- Default: 0% until the business sets a rate. A zero fee is a safe failure mode;
-- a guessed non-zero fee is not.
INSERT INTO public.platform_fee_config (scope, basis_points, fixed_cents, min_fee_cents, currency)
VALUES ('global', 0, 0, 0, 'INR')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. Payment state history
-- ============================================================================
-- Financial transitions need an append-only audit trail for reconciliation and
-- for answering disputes months later. Written on every accepted transition.
CREATE TABLE IF NOT EXISTS public.payment_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    -- 'service' for a user action, 'webhook' for a provider event.
    trigger_source TEXT NOT NULL DEFAULT 'service'
      CHECK (trigger_source IN ('service', 'webhook', 'reconciliation')),
    provider_event_id TEXT,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_status_history_payment
    ON public.payment_status_history (payment_id, created_at DESC);

-- ============================================================================
-- 6. One funded milestone maps to at most one live payment
-- ============================================================================
-- Guards against a double-submit creating two escrow rows for the same milestone.
-- A milestone is funded once; after a refund the milestone is re-openable and a
-- new payment row is expected, so the index is scoped to non-terminal states.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_active_milestone
    ON public.payments (milestone_id)
    WHERE milestone_id IS NOT NULL AND status IN ('pending', 'held_in_escrow');

-- Lookup paths used by the service: participant listings and provider-id reconciles.
CREATE INDEX IF NOT EXISTS idx_payments_payer    ON public.payments (payer_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_recipient ON public.payments (recipient_consultant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_contract  ON public.payments (contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_status    ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payouts_consultant ON public.payouts (consultant_id, created_at DESC);

-- ============================================================================
-- 7. Row level security
-- ============================================================================
-- The service talks to the database with the service role, which bypasses RLS, so
-- these policies are a second boundary for any direct browser read. They follow
-- the Stage 9 contract pattern: participation is proven through the profile's
-- user_id, never through a client-supplied role claim.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_participants_select ON public.payments;
CREATE POLICY payments_participants_select ON public.payments
  FOR SELECT USING (
    public.is_client_profile_owner(payer_client_id)
    OR public.is_consultant_profile_owner(recipient_consultant_id)
  );

DROP POLICY IF EXISTS payouts_participants_select ON public.payouts;
CREATE POLICY payouts_participants_select ON public.payouts
  FOR SELECT USING (public.is_consultant_profile_owner(consultant_id));

DROP POLICY IF EXISTS payment_refunds_participants_select ON public.payment_refunds;
CREATE POLICY payment_refunds_participants_select ON public.payment_refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_id
        AND (public.is_client_profile_owner(p.payer_client_id)
             OR public.is_consultant_profile_owner(p.recipient_consultant_id))
    )
  );

-- The fee configuration is a commercial secret. No browser role reads it.
DROP POLICY IF EXISTS platform_fee_config_no_client_access ON public.platform_fee_config;
CREATE POLICY platform_fee_config_no_client_access ON public.platform_fee_config
  FOR SELECT USING (false);

-- Webhook and audit tables are service-role only. No policy is created, so with
-- RLS enabled and no policy, anon and authenticated are denied by default.
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_status_history   ENABLE ROW LEVEL SECURITY;

-- The browser must never write financial rows directly, and must never read the
-- webhook ledger (raw provider payloads, which carry PII) or the fee
-- configuration (a commercial secret). Everything is revoked from both browser
-- roles, then read access is re-granted only on the three tables a participant
-- may legitimately see. The service role bypasses both grants and RLS.
REVOKE ALL ON public.payments, public.payouts, public.payment_refunds,
    public.platform_fee_config, public.payment_webhook_events,
    public.payment_status_history
    FROM anon, authenticated;

GRANT SELECT ON public.payments, public.payouts, public.payment_refunds
    TO authenticated;

-- ============================================================================
-- 8. Settlement and escrow invariants
-- ============================================================================
-- escrow_released_at may only be set once the payment actually reached the
-- released state, and only for a payment that was funded first. Enforced here so
-- a bug in the service layer cannot fabricate a release timestamp.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payment_release_after_funding;
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_release_after_funding CHECK (
    escrow_released_at IS NULL
    OR (status IN ('released', 'refunded') AND escrow_funded_at IS NOT NULL)
);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payment_refund_after_funding;
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_refund_after_funding CHECK (
    refunded_at IS NULL OR escrow_funded_at IS NOT NULL
);

-- A failed or refunded payment must not claim a settlement happened.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payment_failed_no_settlement;
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_failed_no_settlement CHECK (
    status <> 'failed' OR escrow_released_at IS NULL
);

-- A payout may only be marked completed once it carries a settlement
-- timestamp, so "completed" can never be asserted without evidence.
ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS chk_payout_completed_has_timestamp;
ALTER TABLE public.payouts ADD CONSTRAINT chk_payout_completed_has_timestamp CHECK (
    status <> 'completed' OR processed_at IS NOT NULL
);


-- ============================================================================
-- 9. Funding ceiling and positive-escrow invariants (M-6, M-7)
-- ============================================================================

-- M-7: `payouts.amount_cents` already carries CHECK (amount_cents > 0) from
-- 00001, but escrow creates the Route transfer BEFORE the payout row is
-- inserted. A payment whose net is 0 would therefore call Razorpay to create a
-- 0-value transfer and only then fail the local insert, orphaning a live
-- transfer at the provider. The real fix is a rejection before any provider
-- call (PaymentService.createPayment / openEscrow); this constraint makes the
-- same rule true at the authoritative layer, so no write path can persist a
-- payment that could never pay anyone.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payment_net_positive;
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_net_positive CHECK (net_amount_cents > 0);

-- M-6: the sum of funded milestone payments for a contract must never exceed
-- the agreed contract total. The partial unique index below stops one milestone
-- being funded twice, but nothing stopped a client funding five milestones on a
-- contract worth three. Enforced here rather than in the service so that two
-- concurrent funding requests cannot both pass a read-then-write check.
--
-- `FOR UPDATE` on the contract row serialises funding attempts for that contract,
-- so the second concurrent request observes the first one's committed payment.
CREATE OR REPLACE FUNCTION public.assert_contract_funding_within_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_cents BIGINT;
  v_funded_cents BIGINT;
BEGIN
  IF NEW.milestone_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise concurrent funding of milestones on the same contract.
  SELECT c.total_amount_cents INTO v_total_cents
  FROM public.contracts c
  WHERE c.id = NEW.contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract % does not exist', NEW.contract_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_total_cents IS NULL OR v_total_cents <= 0 THEN
    RAISE EXCEPTION 'Contract % has no positive contract total, so a milestone cannot be escrowed against it', NEW.contract_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- A payment only leaves this set by becoming failed or refunded, so the funded
  -- total is monotonically non-decreasing and a BEFORE INSERT trigger is enough.
  SELECT COALESCE(SUM(p.gross_amount_cents), 0) INTO v_funded_cents
  FROM public.payments p
  WHERE p.contract_id = NEW.contract_id
    AND p.status IN ('pending', 'held_in_escrow', 'released')
    AND p.id <> NEW.id;

  IF v_funded_cents + NEW.gross_amount_cents > v_total_cents THEN
    RAISE EXCEPTION
      'Funding this payment would exceed the contract total: contract total %, already funded %, requested %',
      v_total_cents, v_funded_cents, NEW.gross_amount_cents
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_funding_ceiling ON public.payments;
CREATE TRIGGER trg_contract_funding_ceiling
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.assert_contract_funding_within_total();

REVOKE ALL ON FUNCTION public.assert_contract_funding_within_total() FROM PUBLIC;

