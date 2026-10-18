# Task Queue

Status values: `PROPOSED`, `APPROVED`, `IN_PROGRESS`, `TESTING`,
`REVIEW_REQUIRED`, `COMPLETED`, `BLOCKED`.

Approval is separate from status. A task is implementable only when its current
task record contains `APPROVED FOR LOCAL IMPLEMENTATION`.

| Priority | ID | Task | Status | Approval | Dependencies |
|---|---|---|---|---|---|
| P1 | ADMIN-GAP-001 | Close verified admin audit gaps in local development | PROPOSED | Not approved | Scope decisions; source and test review |
| P1 | ADMIN-GAP-002 | Add or repair the missing dispute mutation route | PROPOSED | Not approved | ADMIN-GAP-001; API contract decision |
| P1 | ADMIN-GAP-003 | Narrow broad admin detail projections | PROPOSED | Not approved | Data-minimization review |
| P1 | ADMIN-GAP-004 | Fix failed-transaction pagination and filter handling | PROPOSED | Not approved | Endpoint contract and test fixtures |
| P1 | ADMIN-GAP-005 | Add dynamic route ID validation | PROPOSED | Not approved | Validation/error contract |
| P2 | ADMIN-GAP-006 | Review error-message disclosure | PROPOSED | Not approved | Security review |
| P2 | ADMIN-GAP-007 | Resolve unused `ADMIN_EMAILS` configuration | PROPOSED | Not approved | Product decision on intended behavior |
| P1 | ADMIN-GAP-008 | Define first-administrator bootstrap and audit-actor design | PROPOSED | Not approved | Human approval; security design |
| P1 | ADMIN-GAP-009 | Verify production migrations and permissions | PROPOSED | Not approved | Explicit production approval |
| P2 | ADMIN-GAP-010 | Add authenticated browser authorization tests | PROPOSED | Not approved | Legitimate test accounts and test environment |
| P1 | ADMIN-AUDIT-CONTRACT-001 | Implement approved local admin dashboard, API remediation, security hardening, and regression coverage | REVIEW_REQUIRED | APPROVED | Local implementation verified; human review and legitimate browser/admin fixtures remain |

Production verification and owner provisioning remain pending because current
evidence does not establish permission to perform them.
