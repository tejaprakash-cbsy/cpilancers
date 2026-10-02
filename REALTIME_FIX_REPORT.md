# Realtime Fix Report

## Root cause
Supabase Realtime was not delivering newly inserted `messages` records because the `messages` table was not included in the `supabase_realtime` publication. Although the client correctly subscribes to `public.messages` for `INSERT` events, and RLS policies correctly guard reads via `messages_select_member`, the backend never transmitted events due to the missing publication.

## Changes
Created migration `supabase/migrations/00017_realtime_messages.sql` to explicitly `ALTER PUBLICATION supabase_realtime ADD TABLE messages;`.

## Database
The migration safely ensures that `messages` is included in the `supabase_realtime` publication without affecting other tables or dropping the publication.

## Security
The `messages` table is protected by `messages_select_member`, which mandates that a user can only select a message if they are a member of its conversation. Because Supabase Realtime filters `postgres_changes` events through the table's `SELECT` policies, Realtime will inherently respect this same policy. No additional real-time specific RLS was required, and no RLS was disabled.

## Runtime verification
**BLOCKED**. The remote Supabase environment (`uzjvaijepqfiogwncdjn.supabase.co`) does not expose database credentials (the `SUPABASE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` do not permit DDL execution like `ALTER PUBLICATION`). Pushing the migration via `npx supabase db push` failed due to missing `postgres` role password. Therefore, the migration cannot be applied to the test environment for runtime or browser verification.

## Browser verification
**BLOCKED**. (See above).

## Regression
Engineering gates were executed:
- TypeScript: `npx tsc --noEmit` - PASS
- ESLint: `npx eslint . --max-warnings=0` - PASS
- Vitest: `npx vitest run` - PASS
- Build: `npm run build` - PASS

## Cleanup
**QA residue = 0**. No test data was created because the migration and subsequent testing could not be completed.

## Remaining limitations
The `00017_realtime_messages.sql` migration must be applied manually by a database administrator with connection credentials. Realtime messaging will continue to fall back to HTTP polling/refresh until the publication is updated.
