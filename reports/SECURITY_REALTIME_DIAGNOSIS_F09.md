# F-09 Diagnostic — Live Realtime Publication Verification

> **DIAGNOSTIC ONLY.** No source, migration, RLS policy, Realtime client, cookie,
> dependency or environment file was modified. No `ALTER PUBLICATION`, no DDL, no
> DML, no package install, nothing staged, nothing committed. The only new file
> is this report.

---

## 1. Current HEAD

| | |
|---|---|
| HEAD | `070dca117ddb54906363622b1b1bb1adfb810723` |
| Short | `070dca1` — "security: validate job patch input" (F-14) |
| Working tree | Clean of tracked modifications; nothing staged |

## 2. The F-09 question

Is `public.messages` **currently** a member of the `supabase_realtime` publication in
the **live** development database (`uzjvaijepqfiogwncdjn`)?

Migration `00017_realtime_messages.sql` asserts it should be. A migration file records
*intent*, not *current state*.

## 3. Live verification methods attempted

| # | Method | Outcome | Blocker |
|---|---|---|---|
| 1 | Direct catalog query (`pg_publication_tables`) | **Not possible** | No DB password; no `psql`; no `pg` driver |
| 2 | Supabase CLI inspection | **Not possible** | `db dump` requires Docker/Podman (absent) **and** DB password |
| 3 | PostgREST catalog exposure | **Not possible** | Catalog lives in `pg_catalog`, not exposed `public` schema |
| 4 | Management API | **Not possible** | API reachable (HTTP 401) but no PAT available to this process |

### 3.1 Method 1 — database catalog

The exact query required:

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;
```

**Cannot be executed.** No credential exists for any of:

- `.env.local`, `.env.development`, `.env.production`, `.env.staging`, `.env.example`
- the current process environment
- `supabase/.temp/*`

Key names are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_JWKS_URL`. **There is no `SUPABASE_DB_PASSWORD`, `PGPASSWORD`, or
`POSTGRES_PASSWORD` anywhere.** A recursive scan of repo JSON/env/toml files found no
password material. `psql` is not installed and no `pg` Node driver is present.

The pooler host is known (`aws-0-ap-south-1.pooler.supabase.com:5432`, user
`postgres.uzjvaijepqfiogwncdjn`) — **but host knowledge without a password is not
access.** No credential was printed, requested, or fabricated.

### 3.2 Method 2 — Supabase CLI

The CLI **is** authenticated and linked:

```
LINKED | ORG ID               | REFERENCE ID         | NAME    | REGION
   yes  | icrecyuyfgripymnlzjm | uzjvaijepqfiogwncdjn | lancers | South Asia (Mumbai)
```

However every read-only schema-inspection path failed:

```
$ supabase db dump --linked --schema public
Dumping schemas from remote database...
docker: command not found (podman also not found)
```

`supabase db dump` shells out to `pg_dump` in a container. Docker and Podman are both
absent, and the command also requires `-p <db password>`. `supabase inspect db`
subcommands require the same direct Postgres credentials.

**No migrations were pushed, pulled, reset, or applied.** The link metadata is
read-only context.

### 3.3 Method 3 — PostgREST (empirically tested, not assumed)

Probed with the service-role key:

| Probe | Result |
|---|---|
| `GET /rest/v1/pg_publication_tables?select=tablename&pubname=eq.supabase_realtime` | **HTTP 404** `PGRST205` — "Could not find the table 'public.pg_publication_tables'" |
---

## 4. Exact live evidence obtained

**None.** No live catalog evidence was obtainable. Nothing below is presented as proof
of publication membership.

For completeness, the following were *observed* but are explicitly **inadmissible**
under the critical-evidence rule:

| Observation | Why it proves nothing |
|---|---|
| `messages` join → `SUBSCRIBED` | Socket join only |
| Binding ID `43783255` | Server assigns IDs for **never-published** tables too |
| `join_reply` OK | Same — accepted for `client_profiles`, never published |
| Authenticated and anon joins identical | Binding acceptance is not authorization |
| `00017_realtime_messages.sql` contents | Records intent, not applied state |

Re-verified at HEAD `070dca1` that `messages`, `notifications`, and
`client_profiles` **all** still return `SUBSCRIBED` with server-assigned binding IDs —
confirming the earlier finding holds at current HEAD.

## 5. Is `messages` published?

**UNKNOWN.** Not inferred, not estimated, not asserted either way.

## 6. Other publication members observed

**None.** No catalog listing was obtainable. No membership list is claimed.

## 7. Why `SUBSCRIBED` is insufficient

Proven empirically in the prior investigation and reconfirmed here: the Realtime server
issues a valid binding ID for tables that were never added to the publication, with no
error surfaced. Subscription acceptance is therefore **uninformative** about
publication state. Only `pg_publication_tables` can settle it.

## 8. Comparison with migration `00017`

| Aspect | Migration file | Live database |
|---|---|---|
| `messages` in `supabase_realtime` | Intended — `ALTER PUBLICATION ... ADD TABLE messages` | **UNKNOWN** |
| Idempotency guard | Present (`IF NOT EXISTS` on `pg_publication_tables`) | n/a |
| Transaction wrapper | `BEGIN` / `COMMIT` | n/a |
| Applied to `uzjvaijepqfiogwncdjn`? | — | **UNKNOWN** — CLI push was reported in a *previous* session and is not independently verifiable here |

The SQL is sound. **Whether it was applied is exactly what cannot be verified.**

## 9. F-10 Cause A — static confirmation at `070dca1`

All four links confirmed by reading current HEAD:

1. **Browser client uses `createBrowserClient`** — `src/lib/supabase/client.ts:1,7`:
   `import { createBrowserClient } from '@supabase/ssr'` → `createBrowserClient(...)`.
2. **SSR browser storage reads `document.cookie`** —
   `@supabase/ssr@0.12.7/dist/main/cookies.js:86`: `parse(document.cookie)`; wired in
   `createBrowserClient.js:25,48` via `createStorageFromOptions` → `storage`.
3. **F-01 sets `HttpOnly`** — `src/lib/supabase/cookie-options.ts:38-40`:
   `httpOnly: true, secure: true, sameSite: 'lax'`; applied at both writers —
   `server.ts:19` and `middleware.ts:24`.
4. **Therefore the browser client cannot read that cookie directly** — `HttpOnly` is
   invisible to `document.cookie` by browser design. The Realtime socket therefore
   carries no authenticated session, and RLS evaluates `auth.uid()` as NULL.

Cause A remains **PROVEN by mechanism**. Nothing was changed, and no workaround was
---

## 10. Access limitations

Live catalog access is impossible in this environment. To close F-09, **one** of these
is required:

1. **The database password** for project `uzjvaijepqfiogwncdjn` — then:
   ```sql
   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```
2. **A Personal Access Token** readable by the process — the Management API
   (`/v1/projects/uzjvaijepqfiogwncdjn/...`) can report project configuration,
   including publication state.
3. **Docker or Podman installed** *and* the DB password — enables `supabase db dump`.

A Dashboard read of **Database → Publications** in the Supabase UI would also settle it
without any credential being shared.

## 11. Final F-09 status

# F-09 — UNVERIFIED

Not `VERIFIED` and not `CONFIRMED MISCONFIGURATION`. The question cannot be answered
from this environment, and no inference is substituted for evidence.

### PROVEN
- The four links of F-10 Cause A, at HEAD `070dca1`.
- `SUBSCRIBED` / binding ID / `join_reply` do **not** establish publication membership.
- PostgREST cannot expose `pg_catalog`; no SQL-executing RPC exists (18 RPCs enumerated).
- No database password or readable PAT exists in any environment file or process.

### UNVERIFIED
- Whether `public.messages` is in `supabase_realtime` **right now**.
- The full membership of the publication.
- Whether `00017` was ever applied to this project.

### INFERENCE (explicitly not evidence)
- That the publication is *probably* correct, given a reported successful CLI push — this
  is a prior-session claim, not a live reading, and is **not** treated as verification.

## 12. Recommended next step

**Read the catalog. Nothing else will settle F-09.** Either:

```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

run with DB credentials, or view **Database → Publications** in the Supabase Dashboard.

Once F-09 is closed on live evidence, F-10 can be re-scoped — Cause A (proven) is
sufficient to break delivery **independently** of publication state, so both must be
addressed for Realtime to work. **No remediation is recommended or performed in this
stage.**
introduced. RLS was not weakened; the cookie hardening was not touched.
| `POST /rest/v1/rpc/exec_sql` | **HTTP 404** `PGRST202` — function does not exist |
| `POST /rest/v1/rpc/query` | **HTTP 404** `PGRST202` — function does not exist |

PostgREST exposes only the `public` schema. `pg_publication_tables` lives in
`pg_catalog`. The API advertises **18 RPCs**; all are application functions
(`is_conversation_member`, `get_unread_message_count`, `refresh_reputation`, …). **None
executes arbitrary SQL.**

**No RPC was created** to reach the catalog — that would be a schema change.

### 3.4 Method 4 — Management API

```
GET https://api.supabase.com/v1/projects/uzjvaijepqfiogwncdjn
→ HTTP 401
```

The endpoint is reachable (401, not a network/DNS failure), but a valid Personal
Access Token is required. The CLI holds its PAT in the **Windows Credential Manager**
(`LegacyGeneric:target=Supabase CLI:supabase`), which is not readable from this
process. **No new credential was created and no secret was requested or echoed.**