# Realtime Fix Report

> **CHRONOLOGY — read this first.**
>
> This report records an **early snapshot**, written at 2026-10-02 22:19, when the
> first `supabase db push` attempt had failed for want of a Postgres password. The
> "Runtime verification: BLOCKED" and "Remaining limitations" sections below are
> that historical state and are kept verbatim for the record. They are **not** the
> final state.
>
> What happened afterwards:
>
> 1. **Initial push — FAILED/BLOCKED.** `npx supabase db push` could not connect
>    (no `postgres` role password). Recorded below.
> 2. **Migration correction.** `00016_forum.sql` failed twice more and was
>    corrected: first the trigger function `trigger_set_timestamp()` was replaced
>    with the existing `update_updated_at_column()`; then the unsupported
>    `moderator` role checks were replaced with the existing `admin` role. No
>    `moderator` role was ever added to the `user_role` enum.
> 3. **Successful push.** The Supabase CLI was then run manually against the
>    confirmed development project `uzjvaijepqfiogwncdjn`. Both `00016_forum.sql`
>    and `00017_realtime_messages.sql` were reported applied ("Push Successful").
>    Corroborating local artifact: `supabase/.temp/` link metadata is timestamped
>    2026-10-02 22:23–22:24, i.e. *after* this report was written.
> 4. **Publication verification (reported, previous session).**
>    `supabase_migrations.schema_migrations` was reported to contain `00016` and
>    `00017`, the forum tables/RLS were reported present remotely, and
>    `pg_publication_tables` was reported to show `messages` in the
>    `supabase_realtime` publication.
>
> **Current status of that verification:** _Previously verified remotely after
> successful CLI push; not independently re-queried in this session._ In the
> current session there is no Supabase CLI on `PATH`, no database password or
> access token in the environment, and `schema_migrations` is not exposed through
> PostgREST (HTTP 404), so the catalog cannot be re-read from here.
>
> **Separate issue — browser delivery still FAILS.** See
> `PRE_SECURITY_BASELINE_REPORT.md` §8. Applying the publication did **not** fix
> delivery: two independent authenticated browser contexts reach `SUBSCRIBED`
> and the server replies `"Subscribed to PostgreSQL"`, but no `postgres_changes`
> INSERT is ever received. Do not read the successful push as "Realtime works".

---

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
