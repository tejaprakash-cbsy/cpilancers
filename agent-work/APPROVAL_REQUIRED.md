# Approval Required

The following require explicit human approval before Codex performs them:

- Adding or changing application source, tests, routes, services, or UI for an
  unapproved task.
- Any production access, production browser testing with privileged accounts,
  or production migration/permission verification.
- Executing production SQL, applying migrations, changing RLS or database
  permissions, or modifying production data.
- Promoting, demoting, or provisioning an administrator account.
- Changing production environment variables, DNS, deployment settings, or
  hosting configuration.
- Destructive actions, irreversible data changes, or security-sensitive design
  decisions outside the approved local task scope.
- Commit, push, merge, reset, release, or deployment operations.

The current `ADMIN-AUDIT-CONTRACT-001` task is approved for local
implementation only. Production access, administrator bootstrap, audit-actor
provisioning, migration/permission verification, deployment, and Git operations
remain unapproved and blocked.
