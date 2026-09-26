-- Fix authenticated Storage access and messaging RLS recursion.
-- The previous conversation_members SELECT policy queried conversation_members
-- while RLS was evaluating that same table, causing PostgreSQL 42P17.

CREATE OR REPLACE FUNCTION public.is_conversation_member(conversation_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = conversation_uuid
      AND cm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(UUID) TO authenticated;

DROP POLICY IF EXISTS "conversation_members_select_member" ON public.conversation_members;
CREATE POLICY "conversation_members_select_member" ON public.conversation_members
  FOR SELECT USING (
    public.is_conversation_member(conversation_id)
  );
