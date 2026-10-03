import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * F-14 — Job PATCH must reject invalid input as a controlled 400 before any
 * database write, rather than letting a Postgres CHECK/NOT NULL/enum violation
 * surface as a generic HTTP 500.
 *
 * These tests drive the real route and the real `JobService`; only the Supabase
 * clients are mocked, which is the same arrangement `jobs-authorization.test.ts`
 * uses.
 */

type Row = Record<string, unknown>;

const OWNER = { id: 'user-owner', role: 'client' };
const OTHER = { id: 'user-other', role: 'client' };
const CONSULTANT = { id: 'user-consultant', role: 'consultant' };
const JOB_ID = '11111111-1111-1111-1111-111111111111';

const stored: Row = {};
const updates: Row[] = [];

let currentUser: Row | null = null;
let dbError: unknown = null;
let ownershipUserId = OWNER.id;

/** Mirrors the real `jobs` table constraints the database would enforce. */
function enforceJobConstraints(row: Row): unknown {
  if (row.title === undefined || row.title === null) {
    return { message: 'null value in column "title" violates not-null constraint' };
  }
  const type = row.budget_type ?? 'fixed_price';
  if (type === 'fixed_price') {
    const fixed = row.budget_fixed_cents;
    if (fixed === undefined || fixed === null || !(fixed > 0)) {
      return { message: 'new row for relation "jobs" violates check constraint "chk_job_budget"' };
    }
  }
  const validTypes = ['p2p', 'a2a', 'b2b', 'batch', 'realtime', 'event_driven', 'hybrid'];
  if (row.integration_type && !validTypes.includes(String(row.integration_type))) {
    return { message: `invalid input value for enum integration_type: "${row.integration_type}"` };
  }
  return null;
}

function mockAdminClient() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            // Mirrors `resolveJobOwnership`: the job row carries its owner's
            // user_id through the `client_profiles!inner(user_id)` join.
            if (table === 'jobs') {
              return {
                data: { status: stored.status, client_profiles: { user_id: ownershipUserId } },
                error: null,
              };
            }
            return { data: null, error: { message: 'not found' } };
          },
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      update: (values: Row) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              const merged = { ...stored, ...values };
              const failure = dbError ?? enforceJobConstraints(merged);
              if (failure) return { data: null, error: failure };
              updates.push(values);
              Object.assign(stored, values);
              return { data: { ...stored }, error: null };
            },
          }),
        }),
      }),
    }),
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockAdminClient() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }) }),
}));
vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUser: async () => currentUser },
}));

const { PATCH } = await import('@/app/api/jobs/[id]/route');

function patch(body: unknown, raw?: string) {
  return PATCH(
    new NextRequest(`https://app.test/api/jobs/${JOB_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  Object.keys(stored).forEach((k) => delete stored[k]);
  Object.assign(stored, {
    id: JOB_ID,
    title: 'A perfectly valid job title',
    description_markdown: 'x'.repeat(60),
    deliverables_markdown: 'y'.repeat(30),
    integration_type: 'hybrid',
    budget_type: 'fixed_price',
    budget_fixed_cents: 25000,
    status: 'draft',
    client_id: 'client-profile-1',
  });
  updates.length = 0;
  dbError = null;
  ownershipUserId = OWNER.id;
  currentUser = OWNER as unknown as Row;
});

describe('F-14 job PATCH validation', () => {
  it('accepts a valid partial update and returns the existing success shape', async () => {
    const res = await patch({ title: 'An updated and still valid job title' });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(stored.title).toBe('An updated and still valid job title');
  });

  it('rejects an empty title with 400 instead of persisting it', async () => {
    const res = await patch({ title: '' });
    expect(res.status).toBe(400);
    // The defect was worse than a 500: this used to be silently accepted.
    expect(stored.title).toBe('A perfectly valid job title');
    expect(updates).toHaveLength(0);
  });

  it('rejects a negative budget_fixed_cents with 400 (the reported 500)', async () => {
    const res = await patch({ budget_fixed_cents: -999999, title: '' });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(stored.budget_fixed_cents).toBe(25000);
    expect(updates).toHaveLength(0);
  });

  it('rejects a non-numeric budget with 400', async () => {
    const res = await patch({ budget_fixed_cents: 'lots' });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('rejects an invalid integration_type enum with 400', async () => {
    const res = await patch({ integration_type: 'middleware' });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('rejects malformed JSON with the existing 400 INVALID_JSON behaviour', async () => {
    const res = await patch(undefined, '{"title": ');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'INVALID_JSON' } });
  });

  it('still performs the status transition rules (status is not schema-modelled)', async () => {
    const ok = await patch({ status: 'open' });
    expect(ok.status).toBe(200);
    expect(stored.status).toBe('open');

    // draft -> hired is not a permitted transition
    const bad = await patch({ status: 'hired' });
    expect(bad.status).toBe(409);
  });

  it('ignores unknown/mass-assignment fields rather than writing them', async () => {
    const res = await patch({
      title: 'A legitimate update to the title here',
      client_id: 'attacker-client-id',
      owner_id: 'attacker-owner-id',
      user_id: 'attacker-user-id',
      created_at: '1999-01-01T00:00:00Z',
      role: 'admin',
      status: 'open',
    });
    expect(res.status).toBe(200);
    expect(stored.client_id).toBe('client-profile-1');
    expect(stored.owner_id).toBeUndefined();
    expect(stored.user_id).toBeUndefined();
    expect(stored.role).toBeUndefined();
    expect(stored.created_at).toBeUndefined();
    expect(updates[0]).not.toHaveProperty('owner_id');
    expect(updates[0]).not.toHaveProperty('user_id');
    expect(updates[0]).not.toHaveProperty('client_id');
  });

  it('returns 403 for an unauthenticated caller without touching the database', async () => {
    currentUser = null;
    const res = await patch({ title: 'Should never be applied here' });
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('returns 403 for a consultant, who is not a client', async () => {
    currentUser = CONSULTANT as unknown as Row;
    const res = await patch({ title: 'Consultants cannot edit jobs at all' });
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('returns 403 for an authenticated non-owner and leaves state unchanged', async () => {
    currentUser = OTHER as unknown as Row;
    const res = await patch({ title: 'A perfectly valid cross-user title' });
    expect(res.status).toBe(403);
    expect(stored.title).toBe('A perfectly valid job title');
    expect(updates).toHaveLength(0);
  });

  it('does not let validation mask an ownership failure', async () => {
    // A non-owner sending an INVALID body must still get 403, not 400: the
    // ownership check runs first, so validation cannot be used to probe.
    currentUser = OTHER as unknown as Row;
    const res = await patch({ budget_fixed_cents: -999999 });
    expect(res.status).toBe(403);
  });

  it('still surfaces a genuine database fault as a 500', async () => {
    dbError = { message: 'connection terminated unexpectedly' };
    const res = await patch({ title: 'A perfectly valid title for this one' });
    expect(res.status).toBe(500);
  });
});
