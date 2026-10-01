# Design notes — decisions taken and deliberately NOT taken

This file records decisions made during the pre-audit completion phase so they
are not relitigated by a later reader, and so the reasoning survives even where
the code reads as arbitrary.

---

## 1. The approved Figma layout was not altered

**Decision:** no visual redesign, no layout change, no spacing/typography pass.

The work in this phase was behavioural only: correctness of async state, API
contract alignment, null-safety, and lint/type gates. Where a page previously
rendered a hardcoded string (for example a placeholder last-message preview, or
hardcoded avatar initials "AN"/"MC"), the fix was to render honest data or an
honest empty state — not to restyle anything.

**Consequence to be aware of:** several dashboard panels deliberately render an
em-dash and an explanatory note (e.g. "No aggregate endpoint") instead of a
metric, because no API exists to populate them. This is intentional and honest. It
is not a loading state and it will not resolve on refresh.

## 2. Both dashboards navigate with `router.push`, not a full reload

**Decision:** the `window.location.assign()` call sites on the dashboards
(client → "Post a job"; consultant → "Find new work" and "View profile") were
changed to `router.push()`.

**Reasoning:** these are in-app navigations between routes of the same
application. A full document reload discards the already-fetched dashboard state
and re-runs every data request for no benefit, and it breaks the client-side back
button.

**What was deliberately kept:** a full reload after sign-out is still correct and
was left alone. Sign-out must drop all in-memory state and any cached server
components; a soft navigation would leave the previous account's data reachable
via the back button. If a sign-out call site is added, it should use a hard
navigation deliberately.

## 3. Missing values render as "Not specified", not as blank or fake

**Decision:** optional fields (hourly rate, years of experience, availability,
location) render the literal string "Not specified" or an em-dash.

**Reasoning:** a blank field reads as "loading" or "broken". A fabricated zero or
a bare dash reads as "no data exists". The explicit string distinguishes the two.
This is why job detail and consultant profile pages show "Not specified" in
several places — that is the intended appearance, not a defect to tidy away.

## 4. The landing page shows honest empty states

**Decision:** where no data exists (no consultants, no reviews, no jobs), the
landing page renders an explicit empty state rather than filler.

**Consequence:** on a database with no content the homepage will visibly say
"No consultant profiles to show yet" / "No reviews yet" / "No jobs found". This is
correct and is not a rendering failure. It is also the fastest way to tell
whether a fresh database has been seeded.

## 5. Realtime degrades to polling rather than being faked

**Decision:** `chat-view.tsx` treats realtime as best-effort. The conversation is
loaded over HTTP on open, on conversation change and on manual refresh, and the
realtime subscription is layered on top. When the channel reports
`CHANNEL_ERROR`/`TIMED_OUT` the component triggers one HTTP refetch instead of
showing an error.

**Reasoning:** `messages` is not in the `supabase_realtime` publication, so
realtime cannot work today. Rather than make the feature appear to work and
silently deliver nothing, the code reports its real state and stays usable.
Enabling the publication is a schema migration, deliberately out of scope here.

**Consequence:** a message sent by another party will not appear without a
refresh. Manual QA must not treat that as a regression introduced in this phase.

## 6. Empty `?next=` is honoured; whitespace is not rejected

**Decision:** `isSafeNextPath` rejects absolute URLs, protocol-relative URLs,
anything not starting with `/`, and control characters. A path containing a
trailing space (e.g. `/jobs `) is accepted.

**Reasoning:** the control is an open-redirect guard, not a canonicaliser.
Rejecting benign whitespace would reject legitimate deep links for no security
benefit, and browsers encode it on navigation. The security-relevant cases —
`//evil.com`, `https://evil.com`, `javascript:...`, header-injection characters —
are all rejected and are pinned by tests.
## 7. Admin access is enforced in the service, not the proxy

**Decision:** `proxy.ts` redirects unauthenticated visitors away from `/admin`,
but a signed-in non-administrator passes straight through.

**Reasoning:** the proxy redirect is a convenience for the common case. The real
authorization is `AdminService.requireAdmin`, which re-reads the role from the
database on every admin request. Enforcing role in the proxy would trust a value
the proxy itself does not verify. This behaviour is pinned by a test so it is not
"tidied" into a false sense of safety.

## 8. Stale async responses are dropped, not merely reordered

**Decision:** every data-loading effect in this app uses the same cancelled-flag
pattern. The flag is checked *before* each state write, by the loader itself, not
by the caller after the loader returns.

**Reasoning:** checking the flag after `await loadX()` returns is useless,
because the loader performs the setState — by the time the caller checks, the
stale write has already landed. This exact bug existed in several files. The
loader therefore takes a `shouldApply` predicate and consults it before every
write, and each loader is `useCallback`'d over exactly what it closes over so
the effect can depend on it without refetching every render.

## 9. Reading React state in the same tick that set it is treated as a bug

**Decision:** three defects were fixed where code did `setX(v)` and then read `x`
in the same synchronous run. React batches, so the read sees the previous value.

**Reasoning:** each of these silently disabled a branch. The consultant
proposal-form page redirected every consultant away because `isConsultant` was
still `false` at the check, making the page unreachable in practice; the
job-proposals ownership verification never ran on first load; and the consultant
proposals list queried with default filters and never refetched on a filter
change. The fix reads the value just computed rather than the state variable.
Tests model React's deferral explicitly so the original defect stays documented.

## 10. Client wrappers take no identity argument

**Decision:** the `userId` parameters were removed from `ClientProposalService`
(and were already inert on others).

**Reasoning:** the API resolves the caller from the session cookie. A userId
argument in a client wrapper is misleading — it implies client-side identity
checks, and it forced callers to write
`(await AuthService.getCurrentUser())?.id as string`, an unchecked cast that
would have sent the literal string `"undefined"` had the session lookup failed.
Authorization belongs to the server.

## 11. Tests target boundaries, not React internals

**Decision:** the project has no jsdom or testing-library. Component-level
behaviour is asserted at the boundary the component actually calls: `fetch` for
client wrappers, the exported route handler for routes, and the decision function
for pure logic.

**Reasoning:** adding a DOM test environment would be a larger change to the
project's testing posture than this phase warrants. The trade-off is explicit: DOM
rendering itself is not covered by automated tests, which is why browser QA
matters and why QA_REPORT.md lists those workflows as NOT TESTED.

**Consequence:** a regression that only manifests during rendering — a thrown
error inside a `.map()`, a null deref while rendering — will not be caught by the
suite. The conversation-list crash fixed in this phase is exactly that class of
bug, and it was found by reading the code, not by a failing test.