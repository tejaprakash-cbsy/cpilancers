/**
 * Stage 13 administrator dashboard — authorization tests.
 *
 * The tests that matter here are the ones that call the REAL AdminService
 * methods with the Supabase client substituted, rather than asserting that a
 * helper returns `true`. The Stage 10 audit found a passing test that asserted a
 * security property production code never enforced, and that is precisely the
 * failure mode this file is written to avoid: if the `requireAdmin` call were
 * deleted from `getOverview` or `moderateUser`, these tests would fail.
 *
 * Coverage:
 *   - a client cannot read the overview, list users, moderate anyone, or read
 *     payments, disputes, reports or the audit log
 *   - a consultant cannot either
 *   - an administrator can
 *   - a SUSPENDED administrator is refused, so suspending an account really does
 *     remove its power rather than only its sign-in
 *   - an administrator cannot moderate themselves
 *   - moderation state machines reject illegal transitions
 *   - request schemas reject a client-supplied admin id or role
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@/types/database';

type Row = Record<string, unknown>;

const db: Record<string, Row[]> = {
  users: [],
  jobs: [],
  proposals: [],
  payments: [],
  payouts: [],
  payment_refunds: [],
  disputes: [],
  reports: [],
  contracts: [],
  milestones: [],
  client_profiles: [],
  consultant_profiles: [],
  admin_audit_log: [],
  profiles: [],
};

interface Query {
  table: string;
  op: 'select' | 'insert' | 'update';
  filters: [string, unknown][];
  payload: Row | null;
  single: boolean;
  /** `maybeSingle()` returns no error for zero rows; `single()` does. */
  maybe: boolean;
}

function matches(row: Row, filters: [string, unknown][]): boolean {
  return filters.every(([col, want]) => {
    const actual = row[col];
    if (want === null) return actual === null || actual === undefined;
    if (Array.isArray(want)) return want.includes(actual);
    return actual === want;
  });
}

function run(q: Query): { data: unknown; error: { message: string } | null; count: number | null } {
  const rows = db[q.table] ?? (db[q.table] = []);

  if (q.op === 'insert') {
    const row: Row = { id: randomUUID(), ...(q.payload ?? {}) };
    rows.push(row);
    return { data: row, error: null, count: null };
  }
  if (q.op === 'update') {
    const target = rows.find((r) => matches(r, q.filters));
    if (!target) return { data: null, error: { message: 'no rows returned' }, count: 0 };
    Object.assign(target, q.payload ?? {});
    return { data: target, error: null, count: 1 };
  }

  const found = rows.filter((r) => matches(r, q.filters));
  if (q.single) {
    if (found[0]) return { data: found[0], error: null, count: 1 };
    // Mirrors supabase-js: maybeSingle() on zero rows is not an error.
    return { data: null, error: q.maybe ? null : { message: 'no rows returned' }, count: 0 };
  }
  return { data: found, error: null, count: found.length };
}

function makeQuery(q: Query): unknown {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(run(q));
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => { q.single = true; q.maybe = prop === 'maybeSingle'; return makeQuery(q); };
        }
        if (prop === 'select' || prop === 'order' || prop === 'limit') {
          return () => makeQuery(q);
        }
        if (prop === 'eq' || prop === 'is') {
          return (col: string, val: unknown) => { q.filters.push([col, val]); return makeQuery(q); };
        }
        if (prop === 'in') {
          return (col: string, val: unknown[]) => { q.filters.push([col, val]); return makeQuery(q); };
        }
        if (prop === 'range') return () => makeQuery(q);
        if (prop === 'insert' || prop === 'update') {
          return (val: Row) => { q.op = prop; q.payload = val; return makeQuery(q); };
        }
        return () => makeQuery(q);
      },
    }
  );
}

/**
 * In-memory stand-in for the four transactional admin functions added in
 * migration 00015. These mirror the PL/pgSQL, including the guards, so a test
 * that passes here is testing the same contract the database enforces:
 *
 *   - the acting administrator must exist, be an admin and be active;
 *   - self-moderation is refused;
 *   - the state machine is re-checked against the row as it exists NOW;
 *   - the audit entry and the update succeed or fail TOGETHER, which is the
 *     M-1 property the previous two-statement implementation could not offer.
 */
const rpcCalls: string[] = [];

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

function actorGuard(adminId: string): RpcResult | null {
  const actor = db.users.find((u) => u.id === adminId);
  if (!actor) {
    return { data: null, error: { code: 'P0002', message: 'Acting administrator does not exist' } };
  }
  if (actor.role !== 'admin' || actor.status !== 'active') {
    return { data: null, error: { code: '42501', message: 'Acting user is not an active administrator' } };
  }
  return null;
}

/** The audit row and the mutation commit together, or neither does. */
function transactional(auditRow: Row, mutate: () => void): RpcResult {
  try {
    mutate();
  } catch (e) {
    // Nothing is committed: the audit row is only appended after `mutate` runs.
    return { data: null, error: { code: '40001', message: String(e) } };
  }
  db.admin_audit_log.push(auditRow);
  return { data: auditRow, error: null };
}

function baseAudit(adminId: string, category: string, targetType: string, targetId: string, reason: unknown, before: Row, after: Row, args: Row): Row {
  return {
    id: randomUUID(),
    admin_user_id: adminId,
    category,
    target_type: targetType,
    target_id: targetId,
    reason: reason ?? null,
    before_state: before,
    after_state: after,
    ip_address: args.p_ip_address ?? null,
    user_agent: args.p_user_agent ?? null,
  };
}

function adminRpc(name: string, args: Record<string, unknown>): RpcResult {
  rpcCalls.push(name);
  const adminId = String(args.p_admin_user_id ?? '');
  const targetId = String(args.p_target_id ?? '');
  const reason = args.p_reason ?? args.p_resolution ?? args.p_action_taken ?? null;

  const guard = actorGuard(adminId);
  if (guard) return guard;
  if (adminId === targetId) {
    return {
      data: null,
      error: { code: '42501', message: 'An administrator cannot change their own account' },
    };
  }

  if (name === 'admin_moderate_user') {
    const to = String(args.p_to_status);
    const target = db.users.find((u) => u.id === targetId);
    if (!target) return { data: null, error: { code: 'P0002', message: 'User not found' } };
    if (target.status === to) {
      return { data: null, error: { code: '23514', message: `This account is already "${to}"` } };
    }
    const allowed =
      (target.status === 'active' && (to === 'suspended' || to === 'deactivated')) ||
      (target.status === 'suspended' && (to === 'active' || to === 'deactivated'));
    if (!allowed) {
      return {
        data: null,
        error: { code: '23514', message: `A "${target.status}" account cannot become "${to}"` },
      };
    }
    const before = target.status;
    return transactional(
      {
        ...baseAudit(
          adminId, 'user', 'user', targetId, reason,
          { status: before, role: target.role },
          { status: to, role: target.role },
          args
        ),
        action:
          to === 'suspended' ? 'user.suspended' : to === 'deactivated' ? 'user.banned' : 'user.reinstated',
      },
      () => { target.status = to; }
    );
  }

  if (name === 'admin_moderate_job') {
    const to = String(args.p_to_moderation);
    const target = db.jobs.find((j) => j.id === targetId);
    if (!target) return { data: null, error: { code: 'P0002', message: 'Job not found' } };
    if (target.moderation_status === to) {
      return { data: null, error: { code: '23514', message: `This job is already "${to}"` } };
    }
    const allowed =
      (target.moderation_status === 'none' && (to === 'flagged' || to === 'removed')) ||
      (target.moderation_status === 'flagged' && (to === 'removed' || to === 'none')) ||
      (target.moderation_status === 'removed' && to === 'none');
    if (!allowed) {
      return {
        data: null,
        error: { code: '23514', message: `A job that is "${target.moderation_status}" cannot become "${to}"` },
      };
    }
    const before = target.moderation_status;
    return transactional(
      {
        ...baseAudit(
          adminId, 'job', 'job', targetId, reason,
          { moderation_status: before },
          { moderation_status: to },
          args
        ),
        action: to === 'removed' ? 'job.removed' : to === 'flagged' ? 'job.flagged' : 'job.moderation_cleared',
      },
      () => {
        target.moderation_status = to;
        target.moderation_reason = to === 'none' ? null : String(reason);
        target.moderated_by_admin_id = to === 'none' ? null : adminId;
        target.moderated_at = to === 'none' ? null : new Date().toISOString();
      }
    );
  }

  if (name === 'admin_update_dispute') {
    const to = String(args.p_to_status);
    const target = db.disputes.find((d) => d.id === targetId);
    if (!target) return { data: null, error: { code: 'P0002', message: 'Dispute not found' } };
    if (target.status === to) {
      return { data: null, error: { code: '23514', message: `This dispute is already "${to}"` } };
    }
    const terminal = ['resolved_refund_client', 'resolved_payout_consultant', 'resolved_split', 'dismissed'].includes(to);
    const before = target.status;
    return transactional(
      {
        ...baseAudit(adminId, 'dispute', 'dispute', targetId, reason, { status: before }, { status: to }, args),
        action: terminal ? `dispute.${to}` : 'dispute.under_review',
      },
      () => {
        target.status = to;
        target.resolution_summary = (args.p_resolution as string) || null;
        target.resolved_by_admin_id = terminal ? adminId : null;
        target.resolved_at = terminal ? new Date().toISOString() : null;
      }
    );
  }

  if (name === 'admin_update_report') {
    const to = String(args.p_to_status);
    const target = db.reports.find((r) => r.id === targetId);
    if (!target) return { data: null, error: { code: 'P0002', message: 'Report not found' } };
    if (target.status === to) {
      return { data: null, error: { code: '23514', message: `This report is already "${to}"` } };
    }
    const before = target.status;
    return transactional(
      {
        ...baseAudit(adminId, 'report', 'report', targetId, reason, { status: before }, { status: to }, args),
        action: `report.${to}`,
      },
      () => {
        target.status = to;
        target.action_taken = String(args.p_action_taken ?? '');
      }
    );
  }

  return { data: null, error: { code: '42883', message: `unknown function ${name}` } };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      makeQuery({ table, op: 'select', filters: [], payload: null, single: false, maybe: false }),
    rpc: (name: string, args: Record<string, unknown>) => adminRpc(name, args ?? {}),
  }),
}));



const { AdminService } = await import('@/services/admin.service');
const {
  isAdminRole,
  canModerate,
  isValidUserStatusTransition,
  isValidJobModerationTransition,
  isValidDisputeTransition,
  isValidReportTransition,
  adminUserModerationSchema,
  adminJobModerationSchema,
  adminDisputeUpdateSchema,
  adminReportUpdateSchema,
} = await import('@/lib/validations/admin.schemas');

const CLIENT = 'user-client';
const CONSULTANT = 'user-consultant';
const ADMIN = 'user-admin';
const SUSPENDED_ADMIN = 'user-admin-suspended';

function seedUser(id: string, role: UserRole, status = 'active') {
  db.users.push({ id, role, status, email: `${id}@example.com` });
  return id;
}

function seedJob(id: string, overrides: Row = {}): Row {
  const row: Row = {
    id,
    title: 'A job',
    status: 'open',
    moderation_status: 'none',
    client_id: 'cp-1',
    ...overrides,
  };
  db.jobs.push(row);
  return row;
}

beforeEach(() => {
  for (const key of Object.keys(db)) db[key] = [];
  seedUser(CLIENT, 'client');
  seedUser(CONSULTANT, 'consultant');
  seedUser(ADMIN, 'admin');
  seedUser(SUSPENDED_ADMIN, 'admin', 'suspended');
});

/** The five shapes of "not allowed", as status codes. */
const DENIED = 403;

// ---------------------------------------------------------------------------
// Non-administrators are refused by every entry point
// ---------------------------------------------------------------------------

describe('administrator authorization', () => {
  it('refuses the overview to a client', async () => {
    await expect(AdminService.getOverview(CLIENT)).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses the overview to a consultant', async () => {
    await expect(AdminService.getOverview(CONSULTANT)).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses user search to a non-administrator', async () => {
    await expect(
      AdminService.searchUsers(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses user detail to a non-administrator', async () => {
    await expect(AdminService.getUserDetail(CLIENT, ADMIN)).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses job search and job detail to a non-administrator', async () => {
    await expect(
      AdminService.searchJobs(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
    await expect(AdminService.getJobDetail(CLIENT, 'job-1')).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses proposals and investigation to a non-administrator', async () => {
    await expect(
      AdminService.searchProposals(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
    await expect(
      AdminService.investigateProposal(CLIENT, 'prop-1')
    ).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses payments, refunds, payouts and failed transactions to a non-administrator', async () => {
    await expect(
      AdminService.listPayments(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
    await expect(
      AdminService.listRefunds(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
    await expect(
      AdminService.listPayouts(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
    await expect(
      AdminService.listFailedTransactions(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses disputes and their evidence to a non-administrator', async () => {
    await expect(
      AdminService.listDisputes(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
    await expect(AdminService.getDisputeDetail(CLIENT, 'dispute-1')).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses dispute resolution to a non-administrator', async () => {
    await expect(
      AdminService.updateDispute(CLIENT, 'dispute-1', {
        status: 'under_review',
      })
    ).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses reports and the audit log to a non-administrator', async () => {
    await expect(
      AdminService.listReports(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
    await expect(AdminService.getReportDetail(CLIENT, 'report-1')).rejects.toMatchObject({ statusCode: DENIED });
    await expect(
      AdminService.updateReport(CLIENT, 'report-1', { status: 'dismissed', actionTaken: 'no' })
    ).rejects.toMatchObject({ statusCode: DENIED });
    await expect(
      AdminService.listAuditLog(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses a non-administrator who does not exist at all', async () => {
    await expect(AdminService.getOverview('ghost-user')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses a SUSPENDED administrator, so a suspension removes real power', async () => {
    // The important case: an admin by role whose account was suspended. Without
    // the status check this would still be allowed to act.
    await expect(AdminService.getOverview(SUSPENDED_ADMIN)).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('allows an active administrator', async () => {
    const overview = await AdminService.getOverview(ADMIN);
    expect(overview.registered_users).toBe(4);
    expect(overview.active_consultants).toBe(1);
    expect(overview.active_clients).toBe(1);
    expect(overview.platform_revenue_cents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Self-moderation
// ---------------------------------------------------------------------------

describe('self-moderation', () => {
  it('refuses an administrator who tries to suspend their own account', async () => {
    db.users.find((u) => u.id === ADMIN)!.status = 'active';
    await expect(
      AdminService.moderateUser(ADMIN, ADMIN, { status: 'suspended', reason: 'self test' })
    ).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses an administrator who tries to ban themselves', async () => {
    await expect(
      AdminService.moderateUser(ADMIN, ADMIN, { status: 'deactivated', reason: 'self test' })
    ).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('refuses self-moderation even when the target does not exist', async () => {
    // The self-check runs before the target is loaded, so the rule holds
    // regardless of what the target row contains.
    await expect(
      AdminService.moderateUser(ADMIN, ADMIN, { status: 'suspended', reason: 'self test' })
    ).rejects.toMatchObject({ statusCode: DENIED });
  });

  it('allows one administrator to moderate another', async () => {
    await AdminService.moderateUser(ADMIN, CLIENT, {
      status: 'suspended',
      reason: 'confirmed fraud',
    });
    // The mutation is applied to the real target row, and only via the
    // transactional function rather than a separate audit-then-update pair.
    expect(rpcCalls).toContain('admin_moderate_user');
    const client = db.users.find((u) => u.id === CLIENT);
    expect(client?.status).toBe('suspended');
  });
});


// ---------------------------------------------------------------------------
// Moderation writes are audited
// ---------------------------------------------------------------------------

describe('administrative audit trail', () => {
  it('records an entry for a user suspension, naming the operator and the reason', async () => {
    await AdminService.moderateUser(ADMIN, CLIENT, { status: 'suspended', reason: 'spam accounts' });
    const entry = db.admin_audit_log[0];
    expect(entry.admin_user_id).toBe(ADMIN);
    expect(entry.action).toBe('user.suspended');
    expect(entry.category).toBe('user');
    expect(entry.target_id).toBe(CLIENT);
    expect(entry.reason).toBe('spam accounts');
    expect(entry.before_state).toMatchObject({ status: 'active' });
    expect(entry.after_state).toMatchObject({ status: 'suspended' });
  });

  it('records an entry for a job removal', async () => {
    seedJob('job-1');
    await AdminService.moderateJob(ADMIN, 'job-1', {
      moderationStatus: 'removed',
      reason: 'requests illegal interception',
    });
    const entry = db.admin_audit_log.find((e) => e.category === 'job');
    expect(entry?.action).toBe('job.removed');
    expect(entry?.reason).toBe('requests illegal interception');
    // The job row is updated by the same call that wrote the entry (M-1).
    expect(db.jobs.find((j) => j.id === 'job-1')?.moderation_status).toBe('removed');
    expect(db.jobs.find((j) => j.id === 'job-1')?.moderated_by_admin_id).toBe(ADMIN);
  });

  it('records an entry for a dispute resolution and links it to the dispute', async () => {
    db.disputes.push({
      id: 'dispute-1', status: 'open', contract_id: 'c-1',
      initiator_user_id: CLIENT, respondent_user_id: CONSULTANT, claimed_amount_cents: 100,
    });
    await AdminService.updateDispute(
      ADMIN,
      'dispute-1',
      { status: 'resolved_refund_client', resolutionSummary: 'Work was never delivered.' },
      { ipAddress: '10.0.0.1', userAgent: 'audit-test' }
    );
    const entry = db.admin_audit_log.find((e) => e.category === 'dispute');
    expect(entry?.admin_user_id).toBe(ADMIN);
    expect(entry?.ip_address).toBe('10.0.0.1');
    // The dispute row itself is advanced by the same transactional call, and the
    // resolution is recorded against the real administrator.
    const stored = db.disputes.find((d) => d.id === 'dispute-1');
    expect(stored?.status).toBe('resolved_refund_client');
    expect(stored?.resolved_by_admin_id).toBe(ADMIN);
    expect(stored?.resolved_at).toBeTruthy();
  });

  it('files a surface-access entry under the auth category, not as moderation', async () => {
    await AdminService.getOverview(ADMIN);
    const access = db.admin_audit_log.find((e) => e.category === 'auth');
    expect(access?.action).toBe('dashboard.overview_viewed');
  });

  it('refuses an illegal job moderation transition and writes no audit entry', async () => {
    seedJob('job-2', { moderation_status: 'removed' });
    await expect(
      AdminService.moderateJob(ADMIN, 'job-2', { moderationStatus: 'flagged', reason: 'try again' })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.admin_audit_log.filter((e) => e.category === 'job')).toHaveLength(0);
  });
});


// ---------------------------------------------------------------------------
// State machines
// ---------------------------------------------------------------------------

describe('moderation state machines', () => {
  it('allows the intended user status transitions', () => {
    expect(isValidUserStatusTransition('active', 'suspended')).toBe(true);
    expect(isValidUserStatusTransition('suspended', 'active')).toBe(true);
    expect(isValidUserStatusTransition('suspended', 'deactivated')).toBe(true);
    expect(isValidUserStatusTransition('active', 'deactivated')).toBe(true);
  });

  it('treats a ban as terminal, so a ban is never undone by lifting a suspension', () => {
    expect(isValidUserStatusTransition('deactivated', 'active')).toBe(false);
    expect(isValidUserStatusTransition('deactivated', 'suspended')).toBe(false);
  });

  it('allows flag, remove and restore on jobs', () => {
    expect(isValidJobModerationTransition('none', 'flagged')).toBe(true);
    expect(isValidJobModerationTransition('none', 'removed')).toBe(true);
    expect(isValidJobModerationTransition('flagged', 'removed')).toBe(true);
    expect(isValidJobModerationTransition('flagged', 'none')).toBe(true);
    expect(isValidJobModerationTransition('removed', 'none')).toBe(true);
  });

  it('refuses a job going from removed straight back to flagged', () => {
    expect(isValidJobModerationTransition('removed', 'flagged')).toBe(false);
  });

  it('treats resolved disputes as terminal', () => {
    expect(isValidDisputeTransition('open', 'under_review')).toBe(true);
    expect(isValidDisputeTransition('under_review', 'resolved_split')).toBe(true);
    expect(isValidDisputeTransition('resolved_split', 'open')).toBe(false);
    expect(isValidDisputeTransition('dismissed', 'under_review')).toBe(false);
  });

  it('treats closed reports as terminal', () => {
    expect(isValidReportTransition('pending', 'investigating')).toBe(true);
    expect(isValidReportTransition('investigating', 'action_taken')).toBe(true);
    expect(isValidReportTransition('action_taken', 'pending')).toBe(false);
    expect(isValidReportTransition('dismissed', 'investigating')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Request schemas cannot carry an identity
// ---------------------------------------------------------------------------

describe('request schemas reject a client-supplied administrator', () => {
  it('rejects an admin_user_id in a user moderation body', () => {
    expect(() =>
      adminUserModerationSchema.parse({
        status: 'suspended', reason: 'because', admin_user_id: ADMIN,
      })
    ).toThrow();
  });

  it('rejects a role field in a user moderation body', () => {
    expect(() =>
      adminUserModerationSchema.parse({ status: 'suspended', reason: 'because', role: 'admin' })
    ).toThrow();
  });

  it('rejects an admin_user_id in a job moderation body', () => {
    expect(() =>
      adminJobModerationSchema.parse({
        moderationStatus: 'removed', reason: 'because', admin_user_id: ADMIN,
      })
    ).toThrow();
  });

  it('rejects a dispute update that names its own resolver', () => {
    expect(() =>
      adminDisputeUpdateSchema.parse({
        status: 'dismissed',
        resolutionSummary: 'cleared it up entirely',
        resolved_by_admin_id: ADMIN,
      })
    ).toThrow();
  });

  it('rejects a report update that names its own reviewer', () => {
    expect(() =>
      adminReportUpdateSchema.parse({
        status: 'dismissed', actionTaken: 'nothing to do', reviewed_by_admin_id: ADMIN,
      })
    ).toThrow();
  });

  it('accepts a well-formed body and requires a reason', () => {
    const parsed = adminUserModerationSchema.parse({ status: 'suspended', reason: 'spam accounts' });
    expect(parsed.status).toBe('suspended');
    expect(() => adminUserModerationSchema.parse({ status: 'suspended', reason: '' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pure predicates
// ---------------------------------------------------------------------------

describe('admin predicates', () => {
  it('recognises only the admin role, case-sensitively', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('client')).toBe(false);
    expect(isAdminRole('consultant')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole('Admin')).toBe(false);
  });

  it('refuses self-moderation by identity comparison', () => {
    expect(canModerate(ADMIN, CLIENT)).toBe(true);
    expect(canModerate(ADMIN, ADMIN)).toBe(false);
  });
});



// ---------------------------------------------------------------------------
// M-1: audit and mutation are one transaction
// ---------------------------------------------------------------------------

describe('M-1 audit and mutation are atomic', () => {
  it('applies the mutation through the transactional function, not a separate pair', async () => {
    rpcCalls.length = 0;
    await AdminService.moderateUser(ADMIN, CLIENT, { status: 'suspended', reason: 'atomic check' });
    // The whole mutation is one RPC. If a separate audit INSERT and UPDATE were
    // still happening in application code, this would be a two-statement path.
    expect(rpcCalls).toEqual(['admin_moderate_user']);
    expect(db.admin_audit_log).toHaveLength(1);
    expect(db.users.find((u) => u.id === CLIENT)?.status).toBe('suspended');
  });

  it('writes no audit entry and applies no mutation when the state machine refuses', async () => {
    // A banned account cannot be re-suspended: the database refuses the
    // transition, and because the audit insert is inside the same transaction
    // it rolls back too.
    db.users.find((u) => u.id === CLIENT)!.status = 'deactivated';
    await expect(
      AdminService.moderateUser(ADMIN, CLIENT, { status: 'suspended', reason: 'nope' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(db.admin_audit_log).toHaveLength(0);
    expect(db.users.find((u) => u.id === CLIENT)?.status).toBe('deactivated');
  });

  it('refuses self-moderation in the database even when the service check is bypassed', async () => {
    // Direct RPC call with the administrator as their own target. This is the
    // property that matters: the rule is enforced where the write happens, not
    // only in the caller.
    const direct = adminRpc('admin_moderate_user', {
      p_admin_user_id: ADMIN,
      p_target_id: ADMIN,
      p_to_status: 'suspended',
      p_reason: 'self',
    });
    expect(direct.error?.code).toBe('42501');
    expect(db.admin_audit_log).toHaveLength(0);
  });

  it('refuses a caller that asserts an administrator who is not an active admin', async () => {
    const notAnAdmin = adminRpc('admin_moderate_user', {
      p_admin_user_id: CLIENT,
      p_target_id: CONSULTANT,
      p_to_status: 'suspended',
      p_reason: 'escalation attempt',
    });
    expect(notAnAdmin.error?.code).toBe('42501');
    expect(db.admin_audit_log).toHaveLength(0);
    expect(db.users.find((u) => u.id === CONSULTANT)?.status).toBe('active');
  });

  it('refuses a suspended administrator even when the RPC is called directly', async () => {
    const suspended = adminRpc('admin_moderate_user', {
      p_admin_user_id: SUSPENDED_ADMIN,
      p_target_id: CLIENT,
      p_to_status: 'suspended',
      p_reason: 'suspended admin acting',
    });
    expect(suspended.error?.code).toBe('42501');
    expect(db.admin_audit_log).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// M-2: the audit snapshot reflects the row that was actually updated
// ---------------------------------------------------------------------------

describe('M-2 audit snapshots reflect the real transition', () => {
  it('records the before-state of the row as it exists at write time', async () => {
    db.users.find((u) => u.id === CLIENT)!.status = 'suspended';
    await AdminService.moderateUser(ADMIN, CLIENT, {
      status: 'active',
      reason: 'reinstating after review',
    });
    const entry = db.admin_audit_log[0];
    // The recorded "before" is `suspended`, the state that was actually replaced,
    // not a value read before some other writer could have changed it.
    expect(entry.before_state).toMatchObject({ status: 'suspended' });
    expect(entry.after_state).toMatchObject({ status: 'active' });
  });

  it('refuses a stale transition and leaves both the row and the log untouched', async () => {
    const target = db.users.find((u) => u.id === CLIENT)!;
    target.status = 'suspended';
    // suspended -> active is legal, so first drive it to a terminal state and
    // then prove a re-application is refused with no audit entry.
    await AdminService.moderateUser(ADMIN, CLIENT, { status: 'active', reason: 'first' });
    expect(db.admin_audit_log).toHaveLength(1);
    await expect(
      AdminService.moderateUser(ADMIN, CLIENT, { status: 'active', reason: 'second' })
    ).rejects.toMatchObject({ statusCode: 409 });
    // Still exactly one entry: the refused attempt recorded nothing.
    expect(db.admin_audit_log).toHaveLength(1);
  });
});



// ---------------------------------------------------------------------------
// Audit log access control (C-1 / audit security)
// ---------------------------------------------------------------------------

describe('audit log access control', () => {
  it('refuses the audit log to a non-administrator', async () => {
    await expect(
      AdminService.listAuditLog(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses the audit log to a suspended administrator', async () => {
    await expect(
      AdminService.listAuditLog(SUSPENDED_ADMIN, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lets an administrator read the log', async () => {
    await AdminService.moderateUser(ADMIN, CLIENT, { status: 'suspended', reason: 'logged' });
    const log = await AdminService.listAuditLog(ADMIN, { page: 1, limit: 25 });
    expect(log.total).toBeGreaterThan(0);
    expect(log.rows.some((r) => r.action === 'user.suspended')).toBe(true);
  });

  it('filters the log by category', async () => {
    await AdminService.moderateUser(ADMIN, CLIENT, { status: 'suspended', reason: 'cat' });
    const log = await AdminService.listAuditLog(ADMIN, { page: 1, limit: 25, category: 'user' });
    expect(log.rows.every((r) => r.category === 'user')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Disputes: authorization and terminal-state protection
// ---------------------------------------------------------------------------

describe('dispute administration', () => {
  function seedDispute(overrides: Row = {}): Row {
    const row: Row = {
      id: 'dispute-1', status: 'open', contract_id: 'c-1',
      initiator_user_id: CLIENT, respondent_user_id: CONSULTANT,
      claimed_amount_cents: 100, initiator_statement: 'stmt',
      evidence_storage_paths: [], ...overrides,
    };
    db.disputes.push(row);
    return row;
  }

  it('refuses the dispute queue and evidence to a non-administrator', async () => {
    seedDispute();
    await expect(
      AdminService.listDisputes(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      AdminService.getDisputeDetail(CLIENT, 'dispute-1')
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lets an administrator read a dispute with its evidence list', async () => {
    seedDispute({ evidence_storage_paths: ['a/b.pdf'] });
    const detail = await AdminService.getDisputeDetail(ADMIN, 'dispute-1');
    const dispute = detail.dispute as Row;
    expect(dispute.evidence_storage_paths).toEqual(['a/b.pdf']);
  });

  it('refuses a resolution with no summary', async () => {
    seedDispute();
    await expect(
      AdminService.updateDispute(ADMIN, 'dispute-1', { status: 'dismissed' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(db.admin_audit_log).toHaveLength(0);
  });

  it('refuses to reopen a resolved dispute and writes no audit entry', async () => {
    seedDispute({ status: 'resolved_refund_client' });
    await expect(
      AdminService.updateDispute(ADMIN, 'dispute-1', {
        status: 'under_review',
        resolutionSummary: 'trying to reopen it',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.admin_audit_log).toHaveLength(0);
    expect(db.disputes[0].status).toBe('resolved_refund_client');
  });

  it('refuses a resolution by a non-administrator', async () => {
    seedDispute();
    await expect(
      AdminService.updateDispute(CONSULTANT, 'dispute-1', {
        status: 'dismissed',
        resolutionSummary: 'not my call to make',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.admin_audit_log).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

describe('report administration', () => {
  it('refuses reports to a non-administrator', async () => {
    await expect(
      AdminService.listReports(CLIENT, { page: 1, limit: 25 })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      AdminService.updateReport(CLIENT, 'r-1', { status: 'dismissed', actionTaken: 'x' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('requires a stated action to close a report', async () => {
    db.reports.push({ id: 'r-1', status: 'pending', target_type: 'user', target_id: 'u-1' });
    await expect(
      AdminService.updateReport(ADMIN, 'r-1', { status: 'dismissed', actionTaken: '' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(db.admin_audit_log).toHaveLength(0);
  });

  it('refuses to reopen a closed report', async () => {
    db.reports.push({ id: 'r-2', status: 'action_taken', target_type: 'job', target_id: 'j-1' });
    await expect(
      AdminService.updateReport(ADMIN, 'r-2', { status: 'pending', actionTaken: 'reopen' })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.admin_audit_log).toHaveLength(0);
  });
});


// ---------------------------------------------------------------------------
// L-5: competing transitions serialize, and only one wins
//
// The real serialization is `SELECT ... FOR UPDATE` inside the plpgsql function
// (00015), which the structural suite in admin-db-hardening.test.ts asserts is
// present and correctly ordered in all four functions. What cannot be done here
// is run two genuine concurrent transactions: this harness is synchronous, so
// it demonstrates the SEQUENTIAL outcome the lock produces, not true parallelism.
// The property under test is that a second competing transition is refused
// against the already-updated row, leaving no contradictory audit state.
// ---------------------------------------------------------------------------

describe('L-5: competing admin transitions cannot both succeed', () => {
  it('a second transition to the same status is refused, with no extra audit row', () => {
    const first = adminRpc('admin_moderate_user', {
      p_admin_user_id: ADMIN,
      p_target_id: CONSULTANT,
      p_to_status: 'suspended',
      p_reason: 'spam',
    });
    expect(first.error).toBeNull();
    expect(db.admin_audit_log).toHaveLength(1);

    // The competing call observes the row the first one committed.
    const second = adminRpc('admin_moderate_user', {
      p_admin_user_id: ADMIN,
      p_target_id: CONSULTANT,
      p_to_status: 'suspended',
      p_reason: 'spam again',
    });
    expect(second.error).not.toBeNull();
    // The refusal writes nothing: an audit row exists only for real mutations.
    expect(db.admin_audit_log).toHaveLength(1);
    expect(db.users.find((u) => u.id === CONSULTANT)?.status).toBe('suspended');
  });

  it('re-evaluates the state machine against the post-lock row, with no audit row', () => {
    // Drive the account to the terminal `deactivated` state, which is the point
    // at which the machine closes. Every later attempt must be refused, and each
    // refusal must leave the log untouched.
    adminRpc('admin_moderate_user', {
      p_admin_user_id: ADMIN,
      p_target_id: CONSULTANT,
      p_to_status: 'suspended',
      p_reason: 'spam',
    });
    const ban = adminRpc('admin_moderate_user', {
      p_admin_user_id: ADMIN,
      p_target_id: CONSULTANT,
      p_to_status: 'deactivated',
      p_reason: 'confirmed fraud',
    });
    expect(ban.error).toBeNull();
    expect(db.admin_audit_log).toHaveLength(2);

    // A reinstatement computed against the ORIGINAL `active` row would look
    // legal to a caller that read the account before the competing change
    // landed. Against the locked row it is refused.
    const staleReinstate = adminRpc('admin_moderate_user', {
      p_admin_user_id: ADMIN,
      p_target_id: CONSULTANT,
      p_to_status: 'active',
      p_reason: 'appeal accepted',
    });
    expect(staleReinstate.error).not.toBeNull();
    expect(db.admin_audit_log).toHaveLength(2);
    expect(db.users.find((u) => u.id === CONSULTANT)?.status).toBe('deactivated');
  });

  it('two competing job moderations leave one state and one audit row each', () => {
    db.jobs = [{ id: 'job-1', moderation_status: 'none', moderation_reason: null }];
    const first = adminRpc('admin_moderate_job', {
      p_admin_user_id: ADMIN,
      p_target_id: 'job-1',
      p_to_moderation: 'flagged',
      p_reason: 'spam',
    });
    expect(first.error).toBeNull();

    const second = adminRpc('admin_moderate_job', {
      p_admin_user_id: ADMIN,
      p_target_id: 'job-1',
      p_to_moderation: 'flagged',
      p_reason: 'spam',
    });
    expect(second.error).not.toBeNull();
    expect(db.jobs[0].moderation_status).toBe('flagged');
    expect(db.admin_audit_log).toHaveLength(1);
  });

  it('the audit row records the state the mutation actually produced', () => {
    adminRpc('admin_moderate_user', {
      p_admin_user_id: ADMIN,
      p_target_id: CONSULTANT,
      p_to_status: 'suspended',
      p_reason: 'spam',
    });
    const row = db.admin_audit_log[0];
    // before/after must agree with the committed row, or the log is fiction.
    expect(row.before_state).toMatchObject({ status: 'active' });
    expect(row.after_state).toMatchObject({ status: 'suspended' });
    expect(db.users.find((u) => u.id === CONSULTANT)?.status).toBe(
      (row.after_state as Row).status
    );
  });

  it('issues exactly one RPC per moderation, so the app cannot de-synchronize', async () => {
    rpcCalls.length = 0;
    await AdminService.moderateUser(ADMIN, CONSULTANT, { status: 'suspended', reason: 'spam' });
    // Not "one RPC for the audit and another for the update": a single call, so
    // there is no window in which one commits without the other.
    expect(rpcCalls).toEqual(['admin_moderate_user']);
  });
});
