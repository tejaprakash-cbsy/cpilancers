-- ============================================================================
-- MESSAGING RLS POLICIES AND STORAGE SETUP
-- Stage 8: Secure Messaging System
-- ============================================================================

-- Enable RLS on all messaging tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONVERSATIONS RLS POLICIES
-- ============================================================================

-- Users can view conversations they are members of
CREATE POLICY "conversations_select_member" ON public.conversations
  FOR SELECT USING (
    id IN (
      SELECT conversation_id FROM public.conversation_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can create conversations (they will be added as member via trigger/app logic)
CREATE POLICY "conversations_insert_authenticated" ON public.conversations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- Users can update conversations they are members of (e.g., last_message_at)
CREATE POLICY "conversations_update_member" ON public.conversations
  FOR UPDATE USING (
    id IN (
      SELECT conversation_id FROM public.conversation_members
      WHERE user_id = auth.uid()
    )
  ) WITH CHECK (
    id IN (
      SELECT conversation_id FROM public.conversation_members
      WHERE user_id = auth.uid()
    )
  );

-- Users cannot delete conversations (soft delete via archiving if needed)
-- No DELETE policy

-- ============================================================================
-- CONVERSATION MEMBERS RLS POLICIES
-- ============================================================================

-- Users can view members of conversations they belong to
CREATE POLICY "conversation_members_select_member" ON public.conversation_members
  FOR SELECT USING (
    conversation_id IN (
      SELECT conversation_id FROM public.conversation_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can be added to conversations (by system/app logic when creating conversation)
CREATE POLICY "conversation_members_insert_system" ON public.conversation_members
  FOR INSERT WITH CHECK (false);

-- Users can update their own membership (e.g., last_read_at, is_muted)
CREATE POLICY "conversation_members_update_own" ON public.conversation_members
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );

-- Users can leave conversations (delete their own membership)
CREATE POLICY "conversation_members_delete_own" ON public.conversation_members
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- ============================================================================
-- MESSAGES RLS POLICIES
-- ============================================================================

-- Users can view messages in conversations they are members of
CREATE POLICY "messages_select_member" ON public.messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT conversation_id FROM public.conversation_members
      WHERE user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );

-- Users can send messages to conversations they are members of
CREATE POLICY "messages_insert_member" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND sender_id = auth.uid()
    AND conversation_id IN (
      SELECT conversation_id FROM public.conversation_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can edit their own messages (within time limit, handled by app)
CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE USING (
    sender_id = auth.uid()
    AND deleted_at IS NULL
  ) WITH CHECK (
    sender_id = auth.uid()
    AND deleted_at IS NULL
  );

-- Users can soft-delete their own messages
CREATE POLICY "messages_delete_own" ON public.messages
  FOR UPDATE USING (
    sender_id = auth.uid()
  ) WITH CHECK (
    sender_id = auth.uid()
    AND deleted_at IS NOT NULL
  );

-- ============================================================================
-- MESSAGE ATTACHMENTS RLS POLICIES
-- ============================================================================

-- Users can view attachments of messages in conversations they are members of
CREATE POLICY "message_attachments_select_member" ON public.message_attachments
  FOR SELECT USING (
    message_id IN (
      SELECT m.id FROM public.messages m
      JOIN public.conversation_members cm ON m.conversation_id = cm.conversation_id
      WHERE cm.user_id = auth.uid()
      AND m.deleted_at IS NULL
    )
  );

-- Users can insert attachments for their own messages
CREATE POLICY "message_attachments_insert_own" ON public.message_attachments
  FOR INSERT WITH CHECK (
    message_id IN (
      SELECT id FROM public.messages
      WHERE sender_id = auth.uid()
    )
  );

-- ============================================================================
-- NOTIFICATIONS RLS POLICIES
-- ============================================================================

-- Users can view their own notifications
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- System can insert notifications (via service role or trigger)
CREATE POLICY "notifications_insert_system" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );

-- ============================================================================
-- REPORTS RLS POLICIES
-- ============================================================================

-- Users can view reports they created
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT USING (
    reporter_user_id = auth.uid()
  );

-- Users can create reports for messages in conversations they are members of
CREATE POLICY "reports_insert_member" ON public.reports
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_user_id = auth.uid()
    AND target_type = 'message'
    AND target_id IN (
      SELECT m.id FROM public.messages m
      JOIN public.conversation_members cm ON m.conversation_id = cm.conversation_id
      WHERE cm.user_id = auth.uid()
      AND m.deleted_at IS NULL
    )
  );

-- Admins can view all reports (handled by admin role check in service)
-- No SELECT policy for admins here; admin access via service role

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_job_id ON public.conversations (job_id);
CREATE INDEX IF NOT EXISTS idx_conversations_proposal_id ON public.conversations (proposal_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contract_id ON public.conversations (contract_id);

-- Conversation Members
CREATE INDEX IF NOT EXISTS idx_conversation_members_user_id ON public.conversation_members (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation_id ON public.conversation_members (conversation_id);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON public.messages (deleted_at) WHERE deleted_at IS NOT NULL;

-- Message Attachments
CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON public.message_attachments (message_id);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read_created_at ON public.notifications (user_id, is_read, created_at DESC);

-- Reports
CREATE INDEX IF NOT EXISTS idx_reports_target_type_target_id ON public.reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_user_id ON public.reports (reporter_user_id);

-- ============================================================================
-- STORAGE BUCKET FOR MESSAGE ATTACHMENTS
-- ============================================================================

-- Note: Storage bucket creation must be done via Supabase Dashboard or CLI
-- This is a placeholder for the required bucket configuration:
-- Bucket name: message-attachments
-- Public: false (private bucket)
-- File size limit: 10MB
-- Allowed MIME types: image/jpeg, image/png, image/gif, image/webp, application/pdf,
--   text/plain, text/csv, application/vnd.ms-excel,
--   application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
--   application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--   application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation

-- Storage policies (to be created in Supabase Dashboard or via CLI):
-- 1. Users can upload to their own folder: message-attachments/{user_id}/*
-- 2. Users can download attachments from conversations they are members of
-- 3. Service role has full access

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- ============================================================================

-- Update updated_at on conversations
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at on conversation_members (if needed)
-- Not needed as conversation_members doesn't have updated_at

-- Update updated_at on messages (if needed)
-- Messages don't have updated_at, only edited_at

-- Update updated_at on notifications
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at on reports
CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION public.get_unread_message_count(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread conversation count for a user
CREATE OR REPLACE FUNCTION public.get_unread_conversation_count(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on helper functions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_unread_message_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_conversation_count(UUID) TO authenticated;
