import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Stage 13 database-hardening regression guards (audit findings L-1, L-2, L-5).
 *
 * The final Cline audit could not close three items by execution, and said so:
 *
 *   L-1  participant-scoped `disputes` RLS was verified structurally but never
 *        with two real authenticated users;
 *   L-2  the append-only `admin_audit_log` trigger was never fired against a
 *        real FK-backed user row;
 *   L-5  no genuine parallel transaction race was ever run.
 *
 * L-1 and L-2 cannot be honestly turned into live tests here. Creating a user
 * requires either a signup the environment rejects, or writing production auth
 * data, and this pass is explicitly barred from inventing credentials or
 * touching production rows. Manufacturing the result with a mock would be worse
 * than leaving the gap visible, so the gap stays visible and is recorded.
 *
 * What these tests DO provide is a structural guard: they read the applied
 * migration text and assert the exact clauses that make each property hold. A
 * later migration that drops the participant policy, narrows the trigger, or
 * reorders the transactional RPC fails here rather than being discovered in
 * production. This is a weaker guarantee than a live test and is not presented
 * as one.
 */

const root = join(process.cwd(), 'supabase', 'migrations');
const m14 = readFileSync(join(root, '00014_admin_dashboard_stage13.sql'), 'utf8');
const m15 = readFileSync(join(root, '00015_admin_transactions_stage13.sql'), 'utf8');

/** Body of a `CREATE OR REPLACE FUNCTION public.<name>` block. */
function functionText(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`function ${name} not found`);
  // The body sits between the opening `AS $$` and the closing `$$ LANGUAGE ...`.
  const open = sql.indexOf('AS $$', start);
  if (open === -1) throw new Error(`opening dollar-quote not found for ${name}`);
  const close = sql.indexOf('$$', open + 'AS $$'.length);
  if (close === -1) throw new Error(`closing dollar-quote not found for ${name}`);
  // Signature AND body: SECURITY DEFINER and search_path are declared in the
  // signature, the validations live in the body.
  return sql.slice(start, close);
}

// ===========================================================================
// L-1: participant-scoped dispute RLS
// ===========================================================================

describe('L-1: disputes RLS is participant-scoped and unreachably granted away', () => {
  it('enables RLS on disputes', () => {
    expect(m14).toMatch(/ALTER TABLE public\.disputes ENABLE ROW LEVEL SECURITY/i);
  });

  it('scopes SELECT to the two named parties only', () => {
    const policy = m14.slice(
      m14.indexOf('CREATE POLICY disputes_participants_select')
    );
    const block = policy.slice(0, policy.indexOf(';'));
    expect(block).toMatch(/initiator_user_id\s*=\s*auth\.uid\(\)/i);
    expect(block).toMatch(/respondent_user_id\s*=\s*auth\.uid\(\)/i);
    // A participant-only predicate, not a role check that an admin could satisfy.
    expect(block).not.toMatch(/role\s*=\s*'admin'/i);
  });

  it('requires the caller to be a party to INSERT, and forbids a self-dispute', () => {
    const policy = m14.slice(m14.indexOf('CREATE POLICY disputes_participants_insert'));
    const block = policy.slice(0, policy.indexOf(';'));
    expect(block).toMatch(/initiator_user_id\s*=\s*auth\.uid\(\)/i);
    expect(block).toMatch(/initiator_user_id\s*<>\s*respondent_user_id/i);
  });

  it('creates no UPDATE or DELETE policy, so both stay denied by default', () => {
    // With RLS on and no permissive policy for a command, the operation is
    // denied. Status changes are an administrative act done via the service role.
    expect(m14).not.toMatch(/CREATE POLICY\s+\w+\s+ON public\.disputes\s+FOR UPDATE/i);
    expect(m14).not.toMatch(/CREATE POLICY\s+\w+\s+ON public\.disputes\s+FOR DELETE/i);
  });

  it('grants no admin RLS policy, so the service role stays the only admin door', () => {
    expect(m14).not.toMatch(/CREATE POLICY[^;]*admin[^;]*ON public\./i);
  });

  it('grants a reporter-only read on reports', () => {
    const policy = m14.slice(m14.indexOf('CREATE POLICY reports_reporter_select'));
    const block = policy.slice(0, policy.indexOf(';'));
    expect(block).toMatch(/reporter_user_id\s*=\s*auth\.uid\(\)/i);
  });

  it('revokes both tables from anon and authenticated outright', () => {
    expect(m14).toMatch(
      /REVOKE ALL ON public\.disputes,\s*public\.reports FROM anon,\s*authenticated;/i
    );
  });
});

// ===========================================================================
// L-2: the audit log is append-only
// ===========================================================================

describe('L-2: admin_audit_log cannot be edited or deleted', () => {
  it('defines a trigger function that refuses UPDATE and DELETE', () => {
    const body = m14.slice(
      m14.indexOf('FUNCTION public.admin_audit_log_is_append_only')
    );
    expect(body).toMatch(/RAISE EXCEPTION/i);
    expect(body).toMatch(/append-only/i);
  });

  it('fires on UPDATE OR DELETE, before the change is applied', () => {
    expect(m14).toMatch(
      /CREATE TRIGGER trg_admin_audit_append_only[\s\S]*?BEFORE UPDATE OR DELETE[\s\S]*?ON public\.admin_audit_log/i
    );
  });

  it('revokes the table from anon and authenticated', () => {
    expect(m14).toMatch(
      /REVOKE ALL ON public\.admin_audit_log FROM anon,\s*authenticated;/i
    );
  });

  it('revokes the trigger function from every non-service role', () => {
    expect(m14).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_audit_log_is_append_only\(\) FROM anon;/i
    );
    expect(m14).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_audit_log_is_append_only\(\) FROM authenticated;/i
    );
    expect(m14).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_audit_log_is_append_only\(\) FROM PUBLIC;/i
    );
  });
});

// ===========================================================================
// L-5: the transactional admin RPCs
// ===========================================================================

const RPCS = [
  'admin_moderate_user',
  'admin_moderate_job',
  'admin_update_dispute',
  'admin_update_report',
] as const;

describe('L-5: audit and mutation are one transaction, in a safe order', () => {
  it.each(RPCS)('%s is SECURITY DEFINER with a pinned search_path', (name) => {
    const body = functionText(m15, name);
    expect(body).toMatch(/SECURITY DEFINER/i);
    // Without a pinned search_path a caller can shadow a referenced object.
    expect(body).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it.each(RPCS)('%s locks the row before snapshotting and updating it', (name) => {
    const body = functionText(m15, name);
    // M-2: the "before" in the audit row must be the row the UPDATE matched,
    // so the lock has to come first.
    const lock = body.search(/FOR UPDATE/i);
    const audit = body.search(/INSERT INTO public\.admin_audit_log/i);
    const update = body.search(/UPDATE public\./i);
    expect(lock).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(audit);
  });

  it.each(RPCS)('%s validates the acting administrator from the database', (name) => {
    const body = functionText(m15, name);
    // The role is re-derived in SQL, never taken from a parameter, so holding
    // the execute grant is not itself an escalation path.
    expect(body).toMatch(/FROM public\.users/i);
    expect(body).toMatch(/role/i);
    expect(body).toMatch(/status/i);
  });

  it('forbids an administrator moderating their own account', () => {
    // Only `admin_moderate_user` carries this check, and correctly so: the rule
    // is about an administrator changing their OWN access, which is meaningful
    // for an account and not for a job listing, dispute or report.
    const body = functionText(m15, 'admin_moderate_user');
    expect(body).toMatch(/p_admin_user_id\s*=\s*p_target_id/);
    expect(body).toMatch(/RAISE EXCEPTION/i);
  });

  it('takes no caller-supplied role or actor identity', () => {
    // A parameter that selects the authority would defeat the whole model.
    expect(m15).not.toMatch(/p_admin_role|p_acting_role|p_is_admin/i);
    for (const name of RPCS) {
      expect(functionText(m15, name)).not.toMatch(/EXECUTE (?:format|dynamic)/i);
    }
  });

  it('revokes execute from anon, authenticated and PUBLIC, per function', () => {
    for (const name of RPCS) {
      const re = new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM anon;`,
        'i'
      );
      expect(m15).toMatch(re);
      expect(
        m15,
        `authenticated revoke missing for ${name}`
      ).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM authenticated;`,
          'i'
        )
      );
      expect(
        m15,
        `PUBLIC revoke missing for ${name}`
      ).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC;`,
          'i'
        )
      );
    }
  });
});
