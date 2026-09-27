-- ============================================================================
-- 00011_rpc_grant_hardening.sql
--
-- Remediation found while validating 00009 against the live database.
--
-- Root cause: Supabase applies a default privilege of
--     GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role
-- which creates an EXPLICIT grant for the `anon` role. `REVOKE ... FROM PUBLIC`
-- (used in 00006 and 00008) removes only the implicit grant that every role
-- inherits from PUBLIC; it does NOT remove the explicit `anon` grant. Every
-- REVOKE ... FROM PUBLIC in the earlier migrations therefore left the function
-- callable by unauthenticated callers.
--
-- Verified live before this migration, using the publishable (anon) key:
--   POST /rest/v1/rpc/create_contract_for_proposal
--     -> 400 P0001 "Proposal is not eligible for hiring"
--   The request reached the function body and ran its authorization branch, so
--   EXECUTE was granted. Against a populated proposals table an unauthenticated
--   caller could have created a contract and flipped the proposal to `accepted`
--   and the job to `hired`, because the function authorizes against the
--   caller-supplied p_client_user_id rather than auth.uid().
--
--   POST /rest/v1/rpc/get_unread_message_count
--     -> 200 (an authenticated-actor guard could not help, because auth.uid() is
--        NULL for anon, which the guard read as "trusted service role")
--
-- Fix: revoke the explicit `anon` grant on the functions that are either
-- state-changing or disclose per-user data, and make the unread-counter guard
-- identify the service role by its JWT claim rather than by the absence of a
-- user id.
--
-- Deliberately NOT revoked from `anon`: the read-only authorization helpers
-- (is_*_owner, can_access_contract, is_conversation_member). They are evaluated
-- inside RLS policies, which run as the querying role, so revoking them would
-- turn an anonymous row-filtering query into a permission error. They derive
-- everything from auth.uid(), which is NULL for anon, so they can only ever
-- return false and disclose nothing.
-- ============================================================================

-- 1. The hiring RPC is a service-role-only, state-changing operation.
--    Revoked from anon (unauthenticated) and from authenticated (no browser
--    session may create a contract; the payment service uses the service role).
REVOKE ALL ON FUNCTION public.create_contract_for_proposal(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.create_contract_for_proposal(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, DATE) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_contract_for_proposal(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, DATE) FROM PUBLIC;

-- 2. Unread counters disclose per-user activity. Authenticated callers keep
--    access (MessagingService uses the session client); anon does not.
REVOKE ALL ON FUNCTION public.get_unread_message_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_unread_conversation_count(UUID) FROM anon;

-- 3. Defence in depth. Grant revocation is the control; this makes the guard
--    correct on its own terms by identifying the service role positively instead
--    of inferring it from the absence of a user id (which is also true of anon).
CREATE OR REPLACE FUNCTION public.get_unread_message_count(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
  caller_is_service BOOLEAN := coalesce(auth.role(), '') = 'service_role';
BEGIN
  -- SECURITY DEFINER: the target user is supplied by the caller, so only ever
  -- answer for the caller's own counters. A caller with no user context is
  -- trusted only when it is demonstrably the service role.
  IF auth.uid() IS NOT NULL AND user_uuid IS DISTINCT FROM auth.uid() THEN
    RETURN 0;
  END IF;
  IF auth.uid() IS NULL AND NOT caller_is_service THEN
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
  caller_is_service BOOLEAN := coalesce(auth.role(), '') = 'service_role';
BEGIN
  -- Same ownership guard as get_unread_message_count.
  IF auth.uid() IS NOT NULL AND user_uuid IS DISTINCT FROM auth.uid() THEN
    RETURN 0;
  END IF;
  IF auth.uid() IS NULL AND NOT caller_is_service THEN
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

-- 4. The funding-ceiling trigger function must stay unreachable as an RPC.
REVOKE ALL ON FUNCTION public.assert_contract_funding_within_total() FROM anon;
REVOKE ALL ON FUNCTION public.assert_contract_funding_within_total() FROM authenticated;
