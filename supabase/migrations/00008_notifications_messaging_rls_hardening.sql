-- ============================================================================
-- 00008_notifications_messaging_rls_hardening.sql
--
-- Fixes confirmed findings from the read-only audit of commit e793c86.
-- Additive only: no previously applied migration is modified, no table or
-- column is dropped, and no unrelated policy or grant is touched.
-- The whole file is idempotent and may be re-applied safely.
--
--   C-2  public.notifications has no updated_at column, but 00003 attaches
--        update_notifications_updated_at -> update_updated_at_column(), which
--        assigns NEW.updated_at. Every UPDATE therefore aborted with
--        'record "new" has no field "updated_at"'.
--   C-3  conversation_members_update_own checked only user_id = auth.uid(),
--        leaving conversation_id free: a member could re-point their own row
--        at any conversation and inherit read access to its messages.
--   C-4  messages_update_own / messages_delete_own never re-checked that the
--        sender still belongs to the message's conversation, unlike
--        messages_insert_member. A member could relocate - and soft-delete -
--        their own message inside a conversation they do not belong to.
--   H-2  get_unread_message_count / get_unread_conversation_count are
--        SECURITY DEFINER, take the target user as a parameter, had no fixed
--        search_path, and were never revoked from PUBLIC, so anon could call
--        them for any user id.
--   H-4  notifications_insert_system allowed any signed-in user to insert
--        notifications into anybody else's inbox.
-- ============================================================================


-- ============================================================================
-- C-2: notifications.updated_at
--
-- 00001 defines notifications without updated_at, while 00003 registers
-- update_notifications_updated_at. Adding the column the existing trigger
-- already expects is the minimal fix: the trigger, the
-- notifications_update_own policy and the mark-as-read endpoint all keep
-- working exactly as written, and no read path changes shape.
-- ============================================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.notifications.updated_at IS
  'Row timestamp maintained by update_updated_at_column() via update_notifications_updated_at.';

-- The trigger is created in 00003, so it normally already exists. Re-create it
-- only when absent so this file stays re-runnable on partially migrated
-- databases without ever dropping an existing trigger.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.notifications'::regclass
      AND tgname  = 'update_notifications_updated_at'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER update_notifications_updated_at
      BEFORE UPDATE ON public.notifications
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;



-- ============================================================================
-- C-3: conversation_members self-membership escalation
--
-- Two independent layers, so the object stays safe even if the grants are ever
-- relaxed again:
--
--   1. Column-level grants. conversation_members was never covered by the
--      00005 revoke list, so authenticated kept the default table-level UPDATE
--      grant and could rewrite its own identity columns. conversation_id,
--      user_id and member_role are now unwritable by any client: PostgreSQL
--      rejects them with 42501 before RLS is even consulted.
--      last_read_message_id / last_read_at / is_muted stay writable because
--      those are the only columns the application ever updates
--      (MessagingService.markMessageAsRead).
--
--   2. The policy re-checks conversation membership on USING and WITH CHECK
--      using the SECURITY DEFINER helper added in 00007, so it cannot recurse.
-- ============================================================================
REVOKE UPDATE ON public.conversation_members FROM anon, authenticated;

GRANT UPDATE (last_read_message_id, last_read_at, is_muted)
  ON public.conversation_members TO authenticated;

DROP POLICY IF EXISTS "conversation_members_update_own" ON public.conversation_members;
CREATE POLICY "conversation_members_update_own" ON public.conversation_members
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
  );


-- ============================================================================
-- C-4: messages conversation authorization
--
-- messages_insert_member already required membership; the two UPDATE policies
-- did not. Adding the same predicate to USING and WITH CHECK closes the
-- relocation and relocate-and-soft-delete variants, while leaving ordinary
-- edits (content, edited_at) and soft deletes (deleted_at) working.
--
-- The same least-privilege column grant used for conversation_members is
-- applied here: a client may edit the body or soft-delete, never re-parent a
-- message. The service role is unaffected - it bypasses both grants and RLS.
-- ============================================================================
REVOKE UPDATE ON public.messages FROM anon, authenticated;

GRANT UPDATE (content, edited_at, deleted_at)
  ON public.messages TO authenticated;

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND deleted_at IS NULL
    AND public.is_conversation_member(conversation_id)
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND deleted_at IS NULL
    AND public.is_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own" ON public.messages
  FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND deleted_at IS NOT NULL
    AND public.is_conversation_member(conversation_id)
  );


-- ============================================================================
-- H-2: unread-count SECURITY DEFINER functions
--
-- 00003 granted EXECUTE to authenticated but never revoked from PUBLIC, so
-- the PostgreSQL default left both functions callable by anon with an
-- arbitrary user_uuid. Three changes:
--
--   * REVOKE ... FROM PUBLIC, then GRANT only to authenticated.
--   * SET search_path = public, as SECURITY DEFINER without a pinned
--     search_path is a privilege-escalation pattern in its own right.
--   * An explicit ownership guard: because the function is SECURITY DEFINER,
--     the parameter is attacker controlled, so it now refuses to answer for
--     anyone but the calling user. The service role has no auth.uid() and is
--     trusted by design, which keeps server-side use working.
--
-- The signatures are unchanged, so MessagingService.getUnreadMessageCount()
-- keeps calling them exactly as before.
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_unread_message_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unread_conversation_count(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_unread_message_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_conversation_count(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_unread_message_count(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  -- SECURITY DEFINER: the target user is supplied by the caller, so only ever
  -- answer for the caller's own counters.
  IF auth.uid() IS NOT NULL AND user_uuid IS DISTINCT FROM auth.uid() THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO unread_count
  FROM public.messages m
  JOIN public.conversation_members cm ON m.conversation_id = cm.conversation_id
  WHERE cm.user_id = user_uuid
    AND m.sender_id != user_uuid
    AND m.deleted_at IS NULL
    AND (
      cm.last_read_message_id IS NULL
      OR m.created_at > (
        SELECT created_at FROM public.messages WHERE id = cm.last_read_message_id
      )
    );
  RETURN unread_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_unread_conversation_count(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  -- Same ownership guard as get_unread_message_count.
  IF auth.uid() IS NOT NULL AND user_uuid IS DISTINCT FROM auth.uid() THEN
    RETURN 0;
  END IF;

  SELECT COUNT(DISTINCT m.conversation_id) INTO unread_count
  FROM public.messages m
  JOIN public.conversation_members cm ON m.conversation_id = cm.conversation_id
  WHERE cm.user_id = user_uuid
    AND m.sender_id != user_uuid
    AND m.deleted_at IS NULL
    AND (
      cm.last_read_message_id IS NULL
      OR m.created_at > (
        SELECT created_at FROM public.messages WHERE id = cm.last_read_message_id
      )
    );
  RETURN unread_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================================
-- H-4: notification spoofing
--
-- notifications_insert_system was WITH CHECK (auth.uid() IS NOT NULL) only, so
-- any signed-in user could write a notification row for any user_id with
-- attacker-controlled title, body and action_url.
--
-- Notifications are a system write, so the client insert path is removed
-- outright: INSERT is revoked from anon and authenticated and the permissive
-- policy is dropped, leaving the service role as the only writer. It bypasses
-- both the grant and RLS. MessagingService.createNotification() was switched to
-- the admin client for exactly this reason.
--
-- SELECT and UPDATE are deliberately untouched: reading and marking one's own
-- notifications must keep working (notifications_select_own /
-- notifications_update_own), and the UPDATE path additionally depends on the
-- C-2 fix above.
-- ============================================================================
REVOKE INSERT ON public.notifications FROM anon, authenticated;

DROP POLICY IF EXISTS notifications_insert_system ON public.notifications;
