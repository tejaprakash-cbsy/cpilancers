# Supabase Realtime Investigation — F-09 / F-10

> **READ-ONLY INVESTIGATION.** No source file, migration, configuration, dependency
> or database row was modified. Nothing was staged and no commit was created.
> The only new file is this report.

---

## 1. Scope

Determine whether F-09 (Realtime publication membership) and F-10 (Realtime event
delivery failure) are configuration, migration, client, RLS, delivery, harness, or
misdiagnosis problems. No prior diagnosis was assumed correct.

## 2. Baseline commit

| | |
|---|---|
| Committed baseline requested | `35ca199` (F-05) |
| **Observed HEAD during investigation** | **`070dca1`** — "security: validate job patch input" (F-14) |
| Working tree | Clean of tracked modifications; nothing staged |

The repository had advanced past the stated baseline because the parallel F-14 agent
committed `070dca1` before this investigation began. This is recorded, not corrected.

---

## 3. F-09 — publication membership

**Status: UNVERIFIED — LIVE PUBLICATION MEMBERSHIP COULD NOT BE READ.**

Migration `00017_realtime_messages.sql` adds `messages` to the publication:

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;
```

It is idempotent, guarded, and transaction-wrapped — correct SQL. **But the live
database state could not be read**: no `postgres` role password, no Supabase access
token, no `SUPABASE_DB_PASSWORD`, no `exec_sql`-style RPC in any migration, and
`pg_publication_tables` is not reachable through PostgREST. `REALTIME_FIX_REPORT.md`
records a *previous-session* CLI push; that claim is **not independently re-verifiable
from here** and is treated as unconfirmed.

### 3.1 The prior verification method is invalid — PROVEN

`REALTIME_FIX_REPORT.md` and earlier reports cite "`SUBSCRIBED` reached" as evidence
the publication is correct. I tested that inference directly by subscribing to three
tables and capturing the server's `join_reply`:

| Table | Ever added to publication? | Client status | Server binding ID |
|---|---|---|---|
| `messages` | claimed (00017) | SUBSCRIBED | `43783255` |
| `notifications` | **never** | SUBSCRIBED | `9073144` |
| `client_profiles` | **never** | SUBSCRIBED | `3951582` |

The raw per-binding reply, captured by instrumenting `_updatePostgresBindings`:

```
[server postgres_changes reply] [{"id":43783255,"event":"INSERT","schema":"public","table":"messages"}]
[server postgres_changes reply] [{"id":9073144,"event":"INSERT","schema":"public","table":"notifications"}]
[server postgres_changes reply] [{"id":3951582,"event":"INSERT","schema":"public","table":"client_profiles"}]
```

**The server issues a valid binding ID for tables that were never published, with no
error.** `SUBSCRIBED` therefore proves only that the socket joined — it is **not**
evidence of publication membership. Any prior conclusion resting on `SUBSCRIBED` is
unsound.

---

## 4. F-10 — event delivery

**Status: ROOT CAUSE IDENTIFIED (one cause PROVEN, one UNVERIFIED).**

A second, previously unexamined cause was found that is independent of publication
membership and that **F-01 introduced**.

### 4.1 Cause A — the browser Realtime client cannot authenticate (PROVEN)

`src/lib/supabase/client.ts` uses `createBrowserClient` from `@supabase/ssr`. That
library persists the session in a **cookie adapter reading `document.cookie`**
(`node_modules/@supabase/ssr/dist/main/cookies.js:86`):

```js
const documentCookieGetAll = () => {
    const parsed = parse(document.cookie);   // <-- JS reads the cookie jar
    ...
};
```

`createBrowserClient` passes that adapter as the auth `storage`.

F-01 hardened the session cookie with `httpOnly: true`
(`src/lib/supabase/cookie-options.ts`). **An `HttpOnly` cookie is invisible to
`document.cookie` by design.** The browser client therefore resolves no session, the
Realtime socket authenticates as **anon**, and RLS evaluates `auth.uid()` as NULL.

Measured RLS visibility against the QA conversation:

| Caller | `messages` rows visible |
|---|---|
### 4.2 Cause B — publication membership (UNVERIFIED)

Cannot be excluded or confirmed without catalog access (§3). It may independently
prevent delivery.

### 4.3 Failure classification

Per Phase 7 categories, for the four known failures:

- **A. INSERT failed** — No. Rows persist; 6 visible to members, and UI renders them.
- **B. INSERT succeeded, publication generated no event** — **Cannot be ruled out** (Cause B).
- **C. Event generated, subscription received nothing** — **PROVEN for Cause A**: the subscriber carries no authenticated JWT, so RLS matches no row.
- **D. Event received, UI ignored** — No. No event is received at all.
- **E. Duplicate suppression removed a valid event** — No. `chat-view.tsx` de-duplicates on `id` after receipt; nothing arrives to suppress.
- **F. Harness misclassification** — No. The 4 failures are consistent and reproducible.
- **G. Unknown** — Residual Cause B.

---

## 5. RLS analysis

`messages_select_member` (`00003_messaging_rls.sql:87`) is correct and unchanged:

```sql
CREATE POLICY "messages_select_member" ON public.messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT conversation_id FROM public.conversation_members
      WHERE user_id = auth.uid()
    ) AND deleted_at IS NULL
  );
```

Distinction that matters: **RLS controls row visibility, not event generation.** An
INSERT always produces a WAL event; RLS decides whether that event is *visible* to a
given subscriber. An anon subscriber is filtered out at the visibility stage — which
is why the channel appears perfectly healthy while delivering nothing.

- Authorised member receives the row: **PROVEN** (6 rows).
- Non-member receives nothing: **PROVEN** (0 rows).
- No policy change is required or recommended.

---

## 6. Client subscription analysis

| Property | Value |
|---|---|
| Channel name | `messages:conversation_id=eq.${conversationId}` |
| Event / schema / table | `INSERT` / `public` / `messages` |
| Filter | `conversation_id=eq.${conversationId}` |
| Status handling | `CHANNEL_ERROR` / `TIMED_OUT` → HTTP refetch fallback |
| Cleanup | `removeChannel`, guarded against double-unsubscribe |
| Duplicate subscriptions | Prevented by effect cleanup on conversation change |

The subscription is well constructed. **Two subscription paths exist**, both with the
same defect: `ClientMessagingService.subscribeToConversation`
(`client-api.service.ts:164`) and `MessagingService.subscribeToConversation`
(`messaging.service.ts:1124`). The latter also creates a fresh client per call and
calls `unsubscribe()` on a channel it never retained — a latent leak, not the
delivery cause.

`SUBSCRIBED` establishes the channel only. Per §3.1 it does not establish publication
membership or delivery.
---

## 8. Security implications

**No exposure was found.** Cause A fails **closed**: it withheld messages from an
unauthenticated channel rather than revealing any.

Any fix must **not** weaken:
- `messages_select_member` or conversation-membership authorization
- server-side API authorization or ownership checks
- RLS generally
- the `HttpOnly`/`Secure` cookie hardening from F-01

**Do not** make `messages` publicly readable, broaden grants, or drop RLS to make
Realtime work. The correct fix restores an *authenticated* channel — it must not
create an unauthenticated one.

---

## 9. Recommended next diagnostic step

1. **Read the catalog.** With DB credentials, run:
   `SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';`
   This settles F-09 in one query and is the single highest-value next action.
2. **Confirm the F-01 interaction in a real browser.** On an authenticated page, check
   whether the Supabase browser client's session resolves (`getSession()`), and inspect
   `document.cookie` for the `sb-*-auth-token` cookie. Expect it to be absent.
3. Only then choose a fix.

## 10. Recommended remediation (evidence-dependent — not applied here)

- **Cause A (proven):** supply the Realtime channel with an authenticated session
  without weakening the cookie. The idiomatic options are a short-lived, non-HttpOnly
  *separate* token cookie for the browser client, or initialising the browser client's
  session from a server-issued value on mount. **This requires a security design
  decision** — it trades a small XSS-exposure surface for restored Realtime and should
  not be implemented unilaterally.
- **Cause B (unverified):** if `messages` is genuinely absent from the publication,
  apply a narrowly scoped migration (re-running the existing idempotent `00017`).

---

## 11. What must NOT be changed

- `messages_select_member`, conversation-membership policies, or any RLS policy
- F-01 cookie attributes (`HttpOnly`, `Secure`, `SameSite=Lax`) as a "fix"
- Server API authorization or ownership checks
- Migrations `00017` or any other migration
- Realtime client filter/channel semantics

---

## 12. Files inspected

Migrations: `00001_initial_schema.sql`, `00003_messaging_rls.sql`,
`00005_core_rls_hardening.sql`, `00007_fix_conversation_members_rls_recursion.sql`,
`00008_notifications_messaging_rls_hardening.sql`, `00017_realtime_messages.sql`,
`supabase/config.toml`, `supabase/.temp/*`

Source: `src/lib/supabase/client.ts`, `server.ts`, `cookie-options.ts`,
`src/services/client-api.service.ts`, `src/services/messaging.service.ts`,
## 13. Exact tests executed

All read-only, run from a scratch directory outside the repository:

| # | Test | Result |
|---|---|---|
| 1 | Subscribe anon to `messages`, `notifications`, `client_profiles`; capture status | All SUBSCRIBED |
| 2 | Capture raw server `join_reply` per binding | Binding IDs issued for **never-published** tables |
| 3 | RLS visibility: anon / client / consultant / outsider | 0 / 6 / 6 / 0 |
| 4 | Authenticated vs anonymous realtime binding | Identical binding ID, both SUBSCRIBED |
| 5 | JWT payload inspection | `role=authenticated`, valid `sub`, `aud=authenticated` |
| 6 | Credential availability audit (env files, process, CLI, catalog reachability) | No DB credentials → catalog unreadable |

No INSERT, UPDATE, DELETE, DDL, or migration was executed. Probe scripts were written
to `%TEMP%\rt-probe\`, outside the repository, and are not part of the working tree.

## 14. Limitations

1. **Publication membership unread** — no DB credentials. F-09 cannot be closed.
2. **No end-to-end delivery reproduction** — INSERT prohibited. Cause A is proven by
   mechanism, not by observing an absent event.
3. **Cause A not proven in a live browser** — established from `@supabase/ssr` source
   and F-01's `httpOnly: true`, not from a browser session. Worth confirming.
4. **Cause B cannot be excluded** — it may co-exist with Cause A.
5. **Supabase managed-service internals not observable** — publication propagation and
   WAL behaviour were not inspected directly.

---

## 15. Conclusion

| Claim | Verdict |
|---|---|
| F-09 publication membership correct | **UNVERIFIED** — and the prior "SUBSCRIBED" evidence is proven invalid |
| F-10 delivery failure | **ROOT CAUSE IDENTIFIED** |
| Cause A: browser client unauthenticated via `HttpOnly` (introduced by F-01) | **PROVEN** |
| Cause B: publication membership | **UNVERIFIED** |
| Security exposure caused | **None** — failure is closed |
| Migration `00017` SQL correctness | Sound and idempotent |

The previous diagnosis ("missing publication, fix the publication") was incomplete.
It rested on an inference that this investigation disproved, and it missed a second
cause created by F-01. Reading `pg_publication_tables` is the next required step.
`src/components/messaging/chat-view.tsx`,
`scripts/rt-browser-e2e.mjs`, `scripts/realtime-e2e-test.mjs`,
`scripts/realtime-qa-setup.mjs`, `scripts/.rt-fixtures.json`

Dependencies: `@supabase/ssr@0.12.7` (`cookies.js`, `createBrowserClient.js`),
`@supabase/supabase-js@2.117.0`, `@supabase/realtime-js@2.117.0`
(`RealtimeChannel.js`)

Reports: `REALTIME_FIX_REPORT.md`, `SECURITY_AUDIT_PHASE1.md`,
`SECURITY_REMEDIATION_PLAN.md`

---

## 7. Browser reproduction

**NOT PERFORMED.** Phase 6 delivery tests require INSERTing messages, which this
read-only mandate prohibits. Existing evidence is reported as found: 12 PASS / 4 FAIL
(`A→B`, `B→A`, burst of 3, duplicate), both channels reaching `SUBSCRIBED`.

Note the source comment at `client-api.service.ts:152` asserting *"No migration in
`supabase/migrations/` performs that ALTER PUBLICATION"* is **stale** — `00017` does
exactly that. Documentation drift, not a security issue.
| anon | **0** |
| client (member) | 6 |
| consultant (member) | 6 |
| outsider (non-member) | **0** |

RLS is working exactly as designed. But an anon Realtime subscriber matches
`messages_select_member` for **zero** rows, so **Supabase Realtime — which evaluates
`postgres_changes` through the table's SELECT policy — delivers no events.**

This is a **defence-in-depth interaction, not a vulnerability**: it caused messages
to be withheld, never exposed. It also explains why the symptom is identical to a
missing publication.

Corroborating note already on record: F-01's report observed the browser client "can
no longer read the session cookie because of `HttpOnly`" and correctly declined to
attribute the delivery failure to it. This investigation shows that observation was
materially more significant than recorded.