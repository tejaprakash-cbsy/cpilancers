# Current Task

## Assignment

ID: `BATCH-10-FORUM-SEED-SCRIPT`

Status: `REVIEW_REQUIRED`

Approval: `APPROVED FOR LOCAL IMPLEMENTATION`

Task: Create an idempotent, reversible TypeScript forum seed script (`scripts/seed-forum.ts`) and dataset (`scripts/data/sap-cpi-forum-seed.ts`) populating 10 non-hireable `@seed.cpilancers.com` personas, 5 SAP Integration categories, and 25 original plain-text SAP CPI discussions with replies, accepted answers, and votes. Local only: do NOT execute `--confirm-seed` against any remote DB, do NOT push to git, do not touch migration 00018 or `forum-security`.

## Actions Executed

1. **Seed Dataset (`scripts/data/sap-cpi-forum-seed.ts`):**
   - Defined 10 isolated Indian SAP Integration personas (`@seed.cpilancers.com`), 5 SAP Integration categories (`cpi-development-groovy`, `pipo-migration`, `adapters-s4hana-security`, `error-handling-ops`, `careers-projects-india`), and 25 original plain-text discussions (5 per category, 1 pinned welcome thread, 2–4 replies each, staggered timestamps across 21 days, realistic view counts, votes, and accepted answers).
   - Formatted all titles, bodies, and replies in clean plain text (zero `**`, `###`, or ```` ``` ````) for `whitespace-pre-wrap` rendering.
2. **Idempotent & Reversible CLI (`scripts/seed-forum.ts`):**
   - Implemented `--dry-run` (Zod + plain-text validation with zero DB calls), `--confirm-seed` (idempotent user/profile/category/discussion/reply/vote seeding without touching `consultant_profiles`, plus safe `ON DELETE RESTRICT` cleanup of unused legacy categories), and `--cleanup --confirm-cleanup` (strictly scoped to `@seed.cpilancers.com`).
3. **Tests & Verification:**
   - Added `src/tests/forum-seed.test.ts` (5 unit tests).
   - Verified `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (52 files, 1,040 tests passed), and `npx tsx scripts/seed-forum.ts --dry-run`.
