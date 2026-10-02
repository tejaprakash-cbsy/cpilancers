-- ============================================================================
-- 00017_realtime_messages.sql
-- Add messages table to Supabase Realtime publication
-- ============================================================================

-- Add the messages table to the realtime publication
-- This allows clients to receive INSERT/UPDATE/DELETE events for this table
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;
  END
  $$;
COMMIT;
