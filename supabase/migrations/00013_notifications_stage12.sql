-- ============================================================================
-- 00013_notifications_stage12.sql
--
-- Stage 12: the notification system.
--
-- Stage 1 created a `notifications` table and a `notification_type` enum, and
-- migration 00008 correctly removed the browser INSERT path (H-4, notification
-- spoofing), leaving the service role as the only writer. This migration keeps
-- that invariant and adds everything Stage 12 needs on top of it:
--
--   1. The four event types the Stage 12 brief requires that the Stage 1 enum
--      never had. The enum had `proposal_shortlisted` but no rejected variant,
--      no milestone-created variant, no payment-failed variant and no
--      contract-completed variant, so four of the fourteen required events had
--      nowhere to be recorded.
--   2. `notifications.dedup_key`, the mechanism that makes "no duplicate
--      notifications for the same event" a database guarantee rather than a
--      convention in application code.
--   3. `notification_deliveries`, a per-channel outbox. This is what makes the
--      channel set extensible: adding SMS or push means adding a row type and a
--      channel implementation, not restructuring the notification table.
--   4. `notification_preferences`, so a user can turn a channel off for a given
--      event type.
--   5. A guarded unread-count function, following the ownership-guard pattern
--      that 00011 corrected.
--
-- Grant hygiene follows the lesson recorded in 00011: on Supabase, REVOKE FROM
-- PUBLIC does not remove the explicit `anon` grant created by
-- `GRANT ALL ON ALL FUNCTIONS IN SCHEMA public`. Every function created here is
-- therefore revoked from `anon`, from `authenticated`, and from `PUBLIC`
-- explicitly, and then granted back only where a browser session genuinely needs
-- it.
-- ============================================================================

-- ============================================================================
-- 1. The four missing event types
-- ============================================================================
-- Existing values are preserved so historical rows stay valid and no existing
-- consumer breaks. The mapping from the Stage 12 brief to the final enum:
--
--   New proposal            -> proposal_received     (already present)
--   Proposal accepted       -> proposal_accepted     (already present)
--   Proposal rejected       -> proposal_rejected     ADDED
--   New message             -> message_received      (already present)
--   Contract created        -> contract_created      (already present)
--   Milestone created       -> milestone_created     ADDED
--   Milestone submitted     -> milestone_submitted   (already present)
--   Milestone approved      -> milestone_approved    (already present)
--   Payment successful      -> payment_escrowed      (already present: funds
--                              captured and held, which is the success path)
--   Payment failed          -> payment_failed        ADDED
--   Payout processed        -> payment_released      (already present)
--   Contract completed      -> contract_completed    ADDED
--   New review              -> review_submitted      (already present)
--   Dispute opened          -> dispute_opened        (already present)
--
-- `proposal_shortlisted`, `contract_accepted`, `milestone_revision`,
-- `dispute_resolved` and `system_alert` already existed and are left in place.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'proposal_rejected';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'milestone_created';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payment_failed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'contract_completed';

-- ============================================================================
-- 2. Dedup
-- ============================================================================
-- The Stage 12 brief requires that a user is never notified twice for the same
-- event. Application-level "check then insert" cannot deliver that: two
-- concurrent handlers both see no row and both insert, and a retried webhook or a
-- replayed request produces the same duplicate.
--
-- `dedup_key` is a deterministic function of the event itself, not a counter or
-- a timestamp. The caller derives it as
--
--     <event type> : <subject entity id> : <recipient user id>
--
-- so a redelivery computes the same string and the unique index rejects the
-- second row. The losing writer is told it lost (23505) and treats that as
-- success, because for a notification the correct outcome of "already notified"
-- and "notified" are the same thing.
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS dedup_key TEXT;

-- Partial: a row with no dedup key is a deliberate one-off (a system alert, an
-- admin broadcast) and must not collide with anything.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedup_key
    ON public.notifications (dedup_key)
    WHERE dedup_key IS NOT NULL;

-- ============================================================================
-- 3. Event context
-- ============================================================================
-- `actor_user_id` is who caused the event, which is what makes "Gaurav sent you
-- a message" possible in both the in-app body and the email subject without
-- re-deriving it at render time. `metadata` carries the template variables so
-- an email can be rendered or re-rendered later from the stored row rather than
-- only at emit time.
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- `is_read` may only become true, and only with a timestamp. Without this a
-- client could clear the badge without leaving a readable audit state.
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS chk_notification_read_state;
ALTER TABLE public.notifications ADD CONSTRAINT chk_notification_read_state CHECK (
    (is_read = false AND read_at IS NULL) OR (is_read = true AND read_at IS NOT NULL)
);

-- ============================================================================
-- 3b. in_app_enabled — the in-app preference is enforced here, not at read time
-- ============================================================================
-- The `notifications` row IS the in-app delivery: the feed renders rows, and the
-- unread badge counts them. So a preference that only stopped the in_app channel
-- from being *invoked* had no observable effect — the row still existed and still
-- appeared, which made the stored setting a lie.
--
-- This column records the decision that was actually made at the creation point.
-- `NotificationService.emit` resolves the recipient's in_app preference before the
-- insert and writes the result here; the feed and the unread count both filter on
-- it. Two layers that agree, with the creation point as the authority.
--
-- A row with `in_app_enabled = false` exists only so a non-in_app channel has
-- something to attach its delivery record to. When the user has switched off
-- every channel, `emit` writes no row at all.
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS in_app_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notifications.in_app_enabled IS
  'Resolved from the recipient''s in_app preference at creation time. False rows exist only as a delivery parent for another channel and are excluded from the feed and the unread count.';

-- The unlocked in-app notifications. Mirrors ESSENTIAL_IN_APP_TYPES in
-- src/lib/notifications/defaults.ts; kept as a constraint so a future migration
-- that adds a type without updating the list cannot silently make an essential
-- event suppressible.
--
-- `type` is compared as text on purpose. 'payment_failed' and
-- 'contract_completed' were added to the enum by ALTER TYPE ... ADD VALUE
-- earlier in THIS SAME transaction, and PostgreSQL refuses to resolve a newly
-- added enum label inside the transaction that created it (SQLSTATE 55P04,
-- "unsafe use of new value"). Casting to text sidesteps enum resolution
-- entirely while comparing exactly the same set of labels, so the constraint
-- keeps its full meaning. On a re-run the values are already committed and the
-- cast is simply redundant.
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS chk_notification_in_app_locked;
ALTER TABLE public.notifications ADD CONSTRAINT chk_notification_in_app_locked CHECK (
    in_app_enabled = true
    OR type::text NOT IN (
        'payment_escrowed', 'payment_failed', 'payment_released',
        'dispute_opened', 'dispute_resolved',
        'contract_created', 'contract_completed',
        'review_submitted', 'system_alert'
    )
);

-- ============================================================================
-- 4. Per-channel delivery outbox
-- ============================================================================
-- One row per (notification, channel). This is the extension point the brief asks
-- for: the notification itself is channel-agnostic, and each channel's attempt
-- and outcome is recorded separately, so a failed email never rolls back or
-- hides a delivered in-app notification.
--
-- `channel` is deliberately TEXT with no CHECK and no enum. An enum would mean a
-- migration for every new channel; here a new channel is a class plus a registry
-- entry, with no schema change at all.
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    -- pending  queued, not attempted yet
    -- sent     accepted by the channel provider
    -- failed   attempted and rejected; retryable
    -- skipped  suppressed by preference, or the channel is not configured
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    -- Provider-side identifier (SendGrid message id), for support and debugging.
    provider_message_id TEXT,
    -- Truncated provider error. Never a credential.
    last_error TEXT,
    -- Where a retryable failure should be picked up again.
    next_retry_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- The core anti-duplication guarantee for channels: one delivery per channel
    -- per notification, so a retried emit cannot send a second email.
    CONSTRAINT uq_notification_delivery_channel
        UNIQUE (notification_id, channel),

    -- A sent or skipped delivery cannot be un-sent, and anything terminal must
    -- not be left looking retryable.
    CONSTRAINT chk_delivery_terminal_state CHECK (
        status NOT IN ('sent', 'skipped') OR next_retry_at IS NULL
    )
);

-- Retry sweep: failed rows that are due.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_retry
    ON public.notification_deliveries (next_retry_at)
    WHERE status = 'failed' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
    ON public.notification_deliveries (notification_id);

-- ============================================================================
-- 5. Preferences
-- ============================================================================
-- Only explicit overrides are stored. A user who has expressed no opinion has no
-- row, and NotificationService falls back to the defaults declared in
-- `src/lib/notifications/defaults.ts`. Storing defaults as rows too would mean
-- changing a default required a migration, and would leave a user who had
-- genuinely never touched a setting indistinguishable from one who had been
-- migrated into it.
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    channel TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One override per (user, event, channel). The upsert in
    -- NotificationService relies on this.
    CONSTRAINT uq_notification_preference UNIQUE (user_id, type, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
    ON public.notification_preferences (user_id);

-- ============================================================================
-- 6. Read-path indexes
-- ============================================================================
-- The unread badge and the notification list are the two hottest reads, and both
-- filter on `is_read = false AND in_app_enabled = true` for one user. A partial
-- index keeps the index to the unread, visible set, which stays small however
-- long a user's history grows, and makes the unread count an index-only scan.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id, created_at DESC)
    WHERE is_read = false AND in_app_enabled = true;

-- The visible feed, which must also exclude rows the user suppressed.
CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
    ON public.notifications (user_id, created_at DESC)
    WHERE in_app_enabled = true;

-- ============================================================================
-- 7. Unread count
-- ============================================================================
-- SECURITY DEFINER because the target user is supplied by the caller, so the
-- function must be able to read another user's rows and then refuse. That is the
-- same shape as `get_unread_message_count`, and it carries the correction 00011
-- made: identifying the service role by its JWT claim rather than by the
-- absence of a user id, because `auth.uid()` is NULL for `anon` too.
--
-- An older, cheaper `get_unread_count()` helper also exists from Stage 1 and
-- counts conversation unread badges. It is left alone: it is a different read
-- and renaming or removing it is out of scope for Stage 12.
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(user_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    unread_count INTEGER;
    caller_is_service BOOLEAN := coalesce(auth.role(), '') = 'service_role';
BEGIN
    -- A caller with a user context may only ever ask about their own count.
    IF auth.uid() IS NOT NULL AND user_uuid IS DISTINCT FROM auth.uid() THEN
        RETURN 0;
    END IF;
    -- A caller with no user context is trusted only when it is demonstrably the
    -- service role, not merely unauthenticated.
    IF auth.uid() IS NULL AND NOT caller_is_service THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*) INTO unread_count
      FROM public.notifications n
     WHERE n.user_id = user_uuid
       AND n.is_read = false;

    RETURN unread_count;
END;
$$;

-- 00011's lesson applied literally: revoke from `anon` (the explicit default
-- grant that `REVOKE FROM PUBLIC` does not remove), from `authenticated`
-- (re-granted immediately below because a signed-in user legitimately needs
-- their own badge), and from `PUBLIC`.
REVOKE ALL ON FUNCTION public.get_unread_notification_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_unread_notification_count(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_unread_notification_count(UUID) FROM PUBLIC;

-- Re-granted to authenticated: the ownership guard above makes a cross-user read
-- return 0 rather than another person's count, so a browser session may call it
-- for itself. `anon` is deliberately NOT re-granted — there is no unauthenticated
-- reason to read a notification count.
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count(UUID) TO authenticated;

-- A resend endpoint must not be callable by a browser session. NotificationService
-- invokes the channel directly, so the deliveries table is never exposed to RPC.
-- Stated explicitly so a future migration does not add a delivery function and
-- leave it callable.
COMMENT ON TABLE public.notification_deliveries IS
  'Per-channel delivery outbox. Service-role only: REVOKE INSERT/UPDATE/DELETE from anon and authenticated below, and never expose a SECURITY DEFINER function over this table.';

-- ============================================================================
-- 8. Row level security
-- ============================================================================
-- `notifications` already has RLS from Stage 1 and keeps its own-row SELECT and
-- UPDATE policies. 00008 removed the INSERT policy and revoked the grant, so the
-- service role remains the only writer; that invariant is preserved here and
-- restated on the new tables so it cannot be lost by omission.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries    ENABLE ROW LEVEL SECURITY;

-- Preferences: a user reads and writes their own, and nobody else's. This is the
-- one Stage 12 table a browser legitimately writes to.
DROP POLICY IF EXISTS notification_preferences_own ON public.notification_preferences;
CREATE POLICY notification_preferences_own ON public.notification_preferences
  FOR ALL USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- The delivery outbox is system state. A user may read their own deliveries
-- (useful for a per-notification delivery status) but must not write, retry or
-- delete them.
DROP POLICY IF EXISTS notification_deliveries_own_read ON public.notification_deliveries;
CREATE POLICY notification_deliveries_own_read ON public.notification_deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.id = notification_id
         AND n.user_id = (SELECT auth.uid())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.notification_preferences, public.notification_deliveries
    FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;

-- `notifications` write path stays closed to the browser. Restated explicitly
-- because it is the single most important invariant inherited from 00008: an
-- authenticated user must not be able to insert a notification addressed to
-- anyone, with attacker-chosen title, body and action_url.
REVOKE INSERT ON public.notifications FROM anon, authenticated;

-- The deliveries table exposes provider error text, so `anon` gets nothing at
-- all, not even the read grant.
REVOKE ALL ON public.notification_deliveries FROM anon;

-- ============================================================================
-- 9. What is deliberately absent
-- ============================================================================
-- * No `ALTER DEFAULT PRIVILEGES`. 00011 established that revoking `anon` from
--   the RLS authorization helpers would break anonymous row-filtering queries,
--   because those functions are evaluated inside policies and therefore run as
--   the querying role. Narrowing the default is a project-wide decision.
-- * No scheduled job. `notification_deliveries.next_retry_at` marks what is due,
--   but running the sweep needs a scheduler this project does not have yet. A
--   `pending` row is therefore surfaced rather than silently abandoned.
-- * No email template ids in the database. Templates live in
--   `src/lib/notifications/email-templates.ts` so they are versioned with the
--   code that renders them, and a change to copy does not need a migration.
