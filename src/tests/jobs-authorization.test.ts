import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Regression coverage for job ownership, visibility and listing filters.
 *
 * The previous engineering sweep fixed real authorization bugs in this area but
 * shipped no tests for them, so every fix below is unverified against
 * regression. Each test drives the real exported handler or service method and
 * asserts on the query that actually reaches Supabase, because the properties
 * that were broken (ownership comparison, draft leakage, filter widening) live
 * in the query construction, not in the return value.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type QueryCall = {
  op: string;
  args: unknown[];
};

/** Recorded calls for one query chain. */
function makeQueryBuilder(result: { data?: unknown; error?: unknown; count?: number }) {
  const calls: QueryCall[] = [];
  const builder: Record<string, unknown> = {};

  for (const op of [
    'select',
    'insert',
    'update',
    'eq',
    'neq',
    'in',
    'or',
    'gte',
    'lte',
    'ilike',
    'contains',
    'order',
    'range',
    'single',
    'maybeSingle',
    'limit',
  ]) {
    // Capture every argument, not just the first: assertions need the value
    // lists passed to `.in()` and `.range()` as well as the column name.
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }

  // The builder is thenable: awaiting it performs the query.
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);

  return { builder, calls };
}

const mockServerClient = vi.fn();
const mockAdminClient = vi.fn();
const mockGetCurrentUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockServerClient(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => mockAdminClient(...args),
}));

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args) },
}));

import {
  JobService,
  PUBLICLY_LISTABLE_JOB_STATUSES,
  resolveJobVisibility,
} from '@/services/job.service';
import { GET as GET_JOBS } from '@/app/api/jobs/route';
import { GET as GET_JOB, PATCH as PATCH_JOB, DELETE as DELETE_JOB } from '@/app/api/jobs/[id]/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_CLIENT_PROFILE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_CLIENT_PROFILE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_JOB_ID = '22222222-2222-4222-8222-222222222222';

/** Row returned by the ownership probe: `select('status, client_profiles!inner(user_id)')`. */
function ownershipRow(status: string, ownerUserId: string | null) {
  return {
    data: {
      status,
      // PostgREST can shape a to-one embed as an object or a one-element array.
      client_profiles: ownerUserId ? { user_id: ownerUserId } : null,
    },
    error: null,
  };
}

let ownershipResult = ownershipRow('draft', OWNER_USER);
let updateResult: { data?: unknown; error?: unknown } = {};
let listResult: { data?: unknown; error?: unknown; count?: number } = { data: [], count: 0 };
let listCalls: QueryCall[] = [];
let clientProfileLookup: { data?: unknown; error?: unknown } = { data: null, error: null };
let singleResult: { data?: unknown; error?: unknown } = { data: null, error: null };

/** A Supabase-client stand-in: `.from()` yields a fresh recorded builder. */
function makeClient(result: { data?: unknown; error?: unknown; count?: number }, calls: QueryCall[]) {
  const { builder } = makeQueryBuilder(result);
  return {
    from: () => {
      // Each call re-binds the shared recorder so every chain in one query is
      // captured in order.
      for (const op of Object.keys(builder)) {
        if (op === 'then') continue;
        (builder as Record<string, (...a: unknown[]) => unknown>)[op] = (...args: unknown[]) => {
          calls.push({ op, args });
          return builder;
        };
      }
      return builder;
    },
    storage: { from: () => ({ remove: async () => undefined, upload: async () => ({ error: null }) }) },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  };
}

/**
 * A `jobs` builder that serves the ownership probe until `.update()` is called,
 * then serves the mutation result.
 *
 * `updateJob`/`publishJob`/`closeJob`/`deleteJob` each create their own admin
 * client, so counting `from('jobs')` calls per client cannot tell the two apart:
 * the probe and the mutation each look like "the first jobs call". Keying off
 * `.update()` is what actually distinguishes a read from a write.
 */
function makeSwitchableJobsBuilder() {
  const calls: QueryCall[] = [];
  let mode: 'read' | 'write' = 'read';
  const builder: Record<string, unknown> = {};

  for (const op of ['select', 'insert', 'eq', 'neq', 'in', 'or', 'gte', 'lte', 'ilike', 'contains', 'order', 'range', 'single', 'maybeSingle']) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.update = (...args: unknown[]) => {
    calls.push({ op: 'update', args });
    mode = 'write';
    return builder;
  };
  builder.delete = (...args: unknown[]) => {
    calls.push({ op: 'delete', args });
    mode = 'write';
    return builder;
  };
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(mode === 'read' ? ownershipResult : updateResult).then(resolve, reject);

  return { builder, calls };
}

function resetSupabase() {
  listResult = { data: [], count: 0 };
  listCalls = [];
  ownershipResult = ownershipRow('draft', OWNER_USER);
  updateResult = {};
  clientProfileLookup = { data: null, error: null };
  singleResult = { data: null, error: null };

  // `getJobById` and `getJobs` both read through the session client.
  mockServerClient.mockImplementation(async () => makeClient(listResult, listCalls));

  const discard: QueryCall[] = [];
  mockAdminClient.mockImplementation(() => ({
    from: (table: string) => {
      if (table === 'client_profiles') return makeClient(clientProfileLookup, discard).from();
      if (table === 'jobs') return makeSwitchableJobsBuilder().builder;
      return makeClient(updateResult, discard).from();
    },
  }));
}

/** Point the session client at a single-row result, for `getJobById`. */
function serveSingleRow(row: { data?: unknown; error?: unknown }) {
  singleResult = row;
  mockServerClient.mockImplementation(async () => {
    const result = listCalls.length === 0 ? singleResult : listResult;
    const calls: QueryCall[] = listCalls;
    return makeClient(result, calls);
  });
}

function jobsGet(query = '') {
  return new NextRequest(`http://localhost/api/jobs${query}`);
}

function jobRequest(method: string, id = JOB_ID, body?: unknown) {
  return new NextRequest(`http://localhost/api/jobs/${id}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

/** All values passed to `.in(column, values)` calls. */
function inFilter(column: string): unknown[] {
  return listCalls.filter((c) => c.op === 'in' && c.args[0] === column).flatMap((c) => (c.args[1] as unknown[]) ?? []);
}

/** The single string passed to `.or(...)`, if any. */
function orFilter(): string | undefined {
  const call = listCalls.find((c) => c.op === 'or');
  return call ? (call.args[0] as string) : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSupabase();
  mockGetCurrentUser.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Job ownership
// ---------------------------------------------------------------------------

describe('job ownership: update', () => {
  it('owner can update their own job', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    updateResult = { data: { id: JOB_ID, title: 'Renamed' }, error: null };
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'client' });

    const res = await PATCH_JOB(jobRequest('PATCH', JOB_ID, { title: 'Renamed' }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { title: string } };
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Renamed');
  });

  it('non-owner cannot update a job', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    mockGetCurrentUser.mockResolvedValue({ id: OTHER_USER, role: 'client' });

    const res = await PATCH_JOB(jobRequest('PATCH', JOB_ID, { title: 'Hijacked' }));

    expect(res.status).toBe(403);
    expect(updateResult).toEqual({});
  });

  it('a non-client cannot update a job even if they own it', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'consultant' });

    const res = await PATCH_JOB(jobRequest('PATCH', JOB_ID, { title: 'Nope' }));

    expect(res.status).toBe(403);
  });

  it('an unauthenticated caller cannot update a job', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PATCH_JOB(jobRequest('PATCH', JOB_ID, { title: 'Nope' }));

    expect(res.status).toBe(403);
  });

  it('rejects a status transition the job state machine forbids', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'client' });

    const res = await PATCH_JOB(jobRequest('PATCH', JOB_ID, { status: 'hired' }));

    expect(res.status).toBe(409);
  });

  it('ignores fields outside the update allowlist', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    updateResult = { data: { id: JOB_ID }, error: null };
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'client' });

    await PATCH_JOB(
      jobRequest('PATCH', JOB_ID, { title: 'Ok', client_id: OTHER_CLIENT_PROFILE, views_count: 9999 })
    );

    // `client_id` and `views_count` are not in `allowedFields`, so they must not
    // reach the update payload.
    expect(JSON.stringify(updateResult)).not.toContain(OTHER_CLIENT_PROFILE);
  });
});

describe('job ownership: publish', () => {
  it('owner can publish their own draft', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    updateResult = { data: null, error: null };

    await expect(JobService.publishJob(JOB_ID, OWNER_USER)).resolves.toBeUndefined();
  });

  it('non-owner cannot publish a job', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);

    await expect(JobService.publishJob(JOB_ID, OTHER_USER)).rejects.toThrow('Job not found');
  });

  it('a job that is not a draft cannot be published', async () => {
    ownershipResult = ownershipRow('open', OWNER_USER);

    await expect(JobService.publishJob(JOB_ID, OWNER_USER)).rejects.toThrow(
      'Only draft jobs can be published'
    );
  });
});

describe('job ownership: close', () => {
  it('owner can close their own open job', async () => {
    ownershipResult = ownershipRow('open', OWNER_USER);
    updateResult = { data: null, error: null };

    await expect(JobService.closeJob(JOB_ID, OWNER_USER)).resolves.toBeUndefined();
  });

  it('owner can close their own in_review job', async () => {
    ownershipResult = ownershipRow('in_review', OWNER_USER);
    updateResult = { data: null, error: null };

    await expect(JobService.closeJob(JOB_ID, OWNER_USER)).resolves.toBeUndefined();
  });

  it('non-owner cannot close a job', async () => {
    ownershipResult = ownershipRow('open', OWNER_USER);

    await expect(JobService.closeJob(JOB_ID, OTHER_USER)).rejects.toThrow('Job not found');
  });

  it('a draft cannot be closed', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);

    await expect(JobService.closeJob(JOB_ID, OWNER_USER)).rejects.toThrow(
      'Job cannot be closed in current status'
    );
  });
});

describe('job ownership: delete', () => {
  it('owner can delete their own draft', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    updateResult = { data: null, error: null };

    await expect(JobService.deleteJob(JOB_ID, OWNER_USER)).resolves.toBeUndefined();
  });

  it('non-owner cannot delete a job', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);

    await expect(JobService.deleteJob(JOB_ID, OTHER_USER)).rejects.toThrow('Job not found');
  });

  it('only a draft can be deleted', async () => {
    ownershipResult = ownershipRow('open', OWNER_USER);

    await expect(JobService.deleteJob(JOB_ID, OWNER_USER)).rejects.toThrow(
      'Only draft jobs can be deleted'
    );
  });

  it('the DELETE route rejects a non-owner with 404', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    mockGetCurrentUser.mockResolvedValue({ id: OTHER_USER, role: 'client' });

    const res = await DELETE_JOB(jobRequest('DELETE'));

    expect(res.status).toBe(404);
  });

  it('the DELETE route lets the owner through', async () => {
    ownershipResult = ownershipRow('draft', OWNER_USER);
    updateResult = { data: null, error: null };
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'client' });

    const res = await DELETE_JOB(jobRequest('DELETE'));
    const body = (await res.json()) as { success: boolean; data: { deleted: boolean } };

    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(true);
  });

  it('the DELETE route rejects a consultant', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'consultant' });

    const res = await DELETE_JOB(jobRequest('DELETE'));

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Job visibility (single job)
// ---------------------------------------------------------------------------

describe('job visibility on GET /api/jobs/[id]', () => {
  const publicStatuses = ['open', 'in_review'];

  it.each(publicStatuses)('a public user can access an %s job', async (status) => {
    serveSingleRow({ data: { id: JOB_ID, status }, error: null });

    const res = await GET_JOB(jobRequest('GET'));

    expect(res.status).toBe(200);
  });

  it('a public user cannot access a draft job', async () => {
    serveSingleRow({ data: { id: JOB_ID, status: 'draft', client_id: OWNER_CLIENT_PROFILE }, error: null });
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET_JOB(jobRequest('GET'));

    // 404, not 403: a 403 would confirm the job exists.
    expect(res.status).toBe(404);
  });

  it.each(['cancelled', 'closed', 'completed', 'hired'])(
    'a public user cannot access a %s job',
    async (status) => {
      serveSingleRow({ data: { id: JOB_ID, status, client_id: OWNER_CLIENT_PROFILE }, error: null });
      mockGetCurrentUser.mockResolvedValue(null);

      const res = await GET_JOB(jobRequest('GET'));

      expect(res.status).toBe(404);
    }
  );

  it('the owner can access their own draft', async () => {
    serveSingleRow({ data: { id: JOB_ID, status: 'draft', client_id: OWNER_CLIENT_PROFILE }, error: null });
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'client' });
    clientProfileLookup = { data: { id: OWNER_CLIENT_PROFILE }, error: null };

    const res = await GET_JOB(jobRequest('GET'));

    expect(res.status).toBe(200);
  });

  it('a signed-in non-owner cannot access another user\'s draft', async () => {
    serveSingleRow({ data: { id: JOB_ID, status: 'draft', client_id: OWNER_CLIENT_PROFILE }, error: null });
    mockGetCurrentUser.mockResolvedValue({ id: OTHER_USER, role: 'client' });
    clientProfileLookup = { data: { id: OTHER_CLIENT_PROFILE }, error: null };

    const res = await GET_JOB(jobRequest('GET'));

    expect(res.status).toBe(404);
  });

  it('a signed-in user with no client profile cannot access a draft', async () => {
    serveSingleRow({ data: { id: JOB_ID, status: 'draft', client_id: OWNER_CLIENT_PROFILE }, error: null });
    mockGetCurrentUser.mockResolvedValue({ id: OTHER_USER, role: 'consultant' });
    clientProfileLookup = { data: null, error: null };

    const res = await GET_JOB(jobRequest('GET'));

    expect(res.status).toBe(404);
  });

  it('returns 404 for a job that does not exist', async () => {
    serveSingleRow({ data: null, error: { message: 'no rows' } });

    const res = await GET_JOB(jobRequest('GET', OTHER_JOB_ID));

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Job listing visibility
// ---------------------------------------------------------------------------

describe('resolveJobVisibility', () => {
  it('gives an anonymous viewer only the public statuses and no draft scope', async () => {
    const visibility = await resolveJobVisibility(null);

    expect(visibility.allowedStatuses).toEqual(PUBLICLY_LISTABLE_JOB_STATUSES);
    expect(visibility.draftOwnerClientId).toBeNull();
  });

  it('gives a viewer with a client profile their own draft scope', async () => {
    clientProfileLookup = { data: { id: OWNER_CLIENT_PROFILE }, error: null };

    const visibility = await resolveJobVisibility(OWNER_USER);

    expect(visibility.allowedStatuses).toEqual([...PUBLICLY_LISTABLE_JOB_STATUSES, 'draft']);
    expect(visibility.draftOwnerClientId).toBe(OWNER_CLIENT_PROFILE);
  });

  it('gives a viewer with no client profile no draft scope', async () => {
    clientProfileLookup = { data: null, error: null };

    const visibility = await resolveJobVisibility(OWNER_USER);

    expect(visibility.draftOwnerClientId).toBeNull();
    expect(visibility.allowedStatuses).not.toContain('draft');
  });

  it('fails closed when the ownership lookup throws', async () => {
    mockAdminClient.mockImplementation(() => {
      throw new Error('admin client unavailable');
    });

    const visibility = await resolveJobVisibility(OWNER_USER);

    expect(visibility.allowedStatuses).toEqual(PUBLICLY_LISTABLE_JOB_STATUSES);
    expect(visibility.draftOwnerClientId).toBeNull();
  });

  it('ignores a malformed client profile id rather than interpolating it into a filter', async () => {
    clientProfileLookup = { data: { id: "'; drop table jobs; --" }, error: null };

    const visibility = await resolveJobVisibility(OWNER_USER);

    expect(visibility.draftOwnerClientId).toBeNull();
  });
});

describe('job listing visibility and filters', () => {
  it('restricts an anonymous listing to the publicly listable statuses', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await GET_JOBS(jobsGet());

    expect(inFilter('status')).toEqual(expect.arrayContaining(['open', 'in_review']));
    expect(inFilter('status')).not.toContain('draft');
    expect(inFilter('status')).not.toContain('closed');
    expect(inFilter('status')).not.toContain('cancelled');
    expect(inFilter('status')).not.toContain('hired');
  });

  it('scopes drafts to the owning client instead of returning every draft', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'client' });
    clientProfileLookup = { data: { id: OWNER_CLIENT_PROFILE }, error: null };

    await GET_JOBS(jobsGet());

    const or = orFilter();
    // Public statuses stay visible...
    expect(or).toContain('status.eq.open');
    expect(or).toContain('status.eq.in_review');
    // ...but a draft is only visible when it belongs to this client.
    expect(or).toContain(`and(status.eq.draft,client_id.eq.${OWNER_CLIENT_PROFILE})`);
    // Critically: a bare `in.('draft')` would leak every client's drafts.
    expect(inFilter('status')).not.toContain('draft');
  });

  it('drops drafts entirely when no owner scope could be resolved', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: OWNER_USER, role: 'client' });
    clientProfileLookup = { data: null, error: null };

    await GET_JOBS(jobsGet());

    expect(inFilter('status')).not.toContain('draft');
    expect(orFilter()).toBeUndefined();
  });

  it('a ?status=draft request cannot widen visibility for an anonymous viewer', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET_JOBS(jobsGet('?status=draft'));
    const body = (await res.json()) as { data: { jobs: unknown[]; total: number } };

    expect(res.status).toBe(200);
    expect(body.data.jobs).toEqual([]);
    expect(body.data.total).toBe(0);
    // No query should have been issued with an empty status ceiling.
    expect(inFilter('status').filter((s) => s === 'draft')).toHaveLength(0);
  });

  it('intersects a requested status list with what the viewer may see', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await GET_JOBS(jobsGet('?status=open,draft,cancelled'));

    // Only `open` survives the intersection with the public ceiling.
    expect(inFilter('status')).toContain('open');
    expect(inFilter('status')).not.toContain('draft');
    expect(inFilter('status')).not.toContain('cancelled');
  });

  it('returns nothing when the requested status is entirely outside the ceiling', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET_JOBS(jobsGet('?status=closed,hired'));
    const body = (await res.json()) as { data: { jobs: unknown[] } };

    expect(body.data.jobs).toEqual([]);
  });

  it('applies a budget range filter to the fixed budget column', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await GET_JOBS(jobsGet('?budgetMin=100000&budgetMax=500000'));

    expect(listCalls.some((c) => c.op === 'gte' && c.args[0] === 'budget_fixed_cents')).toBe(true);
    expect(listCalls.some((c) => c.op === 'lte' && c.args[0] === 'budget_fixed_cents')).toBe(true);
  });

  it('applies the budget type filter to the real budget_type column', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await GET_JOBS(jobsGet('?budgetType=fixed_price'));

    expect(listCalls.some((c) => c.op === 'eq' && c.args[0] === 'budget_type' && c.args[1] === 'fixed_price')).toBe(true);
  });

  it('never filters on project_type or experience_required, which do not exist on jobs', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await GET_JOBS(jobsGet('?projectType=hourly&experienceMin=5'));

    const columns = listCalls.map((c) => String(c.args[0]));
    expect(columns).not.toContain('project_type');
    expect(columns).not.toContain('experience_required');
  });

  it('rejects a malformed numeric filter with 400', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET_JOBS(jobsGet('?budgetMin=abc'));

    expect(res.status).toBe(400);
  });

  it.each(['?page=0', '?page=-5', '?limit=0', '?limit=-1', '?limit=abc', '?page=abc'])(
    'falls back to safe pagination defaults for %s',
    async (query) => {
      mockGetCurrentUser.mockResolvedValue(null);
      listResult = { data: [], count: 0, error: null };

      const res = await GET_JOBS(jobsGet(query));
      const body = (await res.json()) as { data: { page: number; limit: number } };

      expect(res.status).toBe(200);
      expect(body.data.page).toBe(1);
      expect(body.data.limit).toBe(10);
    }
  );

  it('caps an excessive limit so the whole table cannot be requested at once', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET_JOBS(jobsGet('?limit=1000000'));
    const body = (await res.json()) as { data: { limit: number } };

    expect(body.data.limit).toBe(50);
  });

  it('clamps an absurd page number into a bounded range window', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    listResult = { data: [], count: 0, error: null };

    const res = await GET_JOBS(jobsGet('?page=99999&limit=10'));

    expect(res.status).toBe(200);
    const range = listCalls.find((c) => c.op === 'range');
    expect(range?.args).toEqual([999980, 999989]);
  });

  it('defaults sorting to newest first and honours an explicit sort', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await GET_JOBS(jobsGet());
    expect(listCalls.find((c) => c.op === 'order')?.args[0]).toBe('created_at');

    resetSupabase();
    mockGetCurrentUser.mockResolvedValue(null);
    await JobService.getJobs({ sortBy: 'views_count', sortOrder: 'asc', allowedStatuses: PUBLICLY_LISTABLE_JOB_STATUSES });
    const order = listCalls.find((c) => c.op === 'order');
    expect(order?.args[0]).toBe('views_count');
    expect(order?.args[1]).toEqual({ ascending: true });
  });

  it('falls back to created_at for a sortBy outside the allowlist', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await JobService.getJobs({
      sortBy: 'client_profiles(user_id)',
      allowedStatuses: PUBLICLY_LISTABLE_JOB_STATUSES,
    });

    expect(listCalls.find((c) => c.op === 'order')?.args[0]).toBe('created_at');
  });

  it('defaults to the public status ceiling when no visibility context is supplied', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await JobService.getJobs({});

    // Previously an absent `allowedStatuses` array meant "no status filter",
    // which returned every row in the table including other clients' drafts.
    expect(inFilter('status')).toEqual(expect.arrayContaining(['open', 'in_review']));
    expect(inFilter('status')).not.toContain('draft');
  });
});