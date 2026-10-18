<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Shared Agent Workflow

This repository uses shared files for coordination between the planning engineer
(ChatGPT) and the coding agent (Codex).

## Permanent rules

1. Inspect the project structure, existing implementation, and tests before changing code.
2. Work only on the task described in `agent-work/CURRENT_TASK.md`.
3. A task is approved for implementation only when it contains the exact marker `APPROVED FOR LOCAL IMPLEMENTATION`.
4. Approved tasks may be implemented locally without requesting confirmation for every routine coding step.
5. Run appropriate tests, TypeScript checks, linting, and builds where practical.
6. Record exact commands, actual results, failures, and untested items in `agent-work/IMPLEMENTATION_REPORT.md`.
7. Never invent successful test results.
8. Do not silently broaden task scope. Record additional findings as proposed follow-up tasks.
9. Do not commit, push, merge, reset Git history, or deploy without explicit human approval.
10. Do not modify production databases, execute production SQL, apply migrations, promote accounts, alter production permissions, change DNS, or change production environment variables without explicit human approval.
11. Never expose credentials, service-role keys, session tokens, passwords, or secrets in reports.
12. Do not disable security controls or weaken authentication, authorization, RLS, origin validation, redirect validation, or session protections to make tests pass.
13. Preserve unrelated user changes and never overwrite work from another agent.
14. If another agent is modifying the same files, stop and report the conflict.
15. If a task requires production access, destructive operations, a schema change, or a security-sensitive decision outside its approval scope, stop before that operation and document the blocker.

## Shared-file protocol

- `agent-work/TASK_QUEUE.md`: prioritized tasks with IDs, status, dependencies, and approval state.
- `agent-work/CURRENT_TASK.md`: the single task currently assigned to Codex, including scope, permitted actions, acceptance criteria, and approval marker.
- `agent-work/IMPLEMENTATION_REPORT.md`: append a dated report for each completed or blocked task.
- `agent-work/APPROVAL_REQUIRED.md`: decisions or operations requiring explicit human approval.
- `agent-work/audit-status.md`: concise index of verified, partially verified, and unverified findings.

The existence of a task file is not approval. Codex must not start implementing an
unapproved task.

## Task lifecycle

`PROPOSED -> APPROVED -> IN_PROGRESS -> TESTING -> REVIEW_REQUIRED -> COMPLETED`

Use `BLOCKED` when a required dependency or permission is missing. A task must not
be marked `COMPLETED` if its acceptance criteria or required tests have failed.
A completed local task still requires human review before production release.
