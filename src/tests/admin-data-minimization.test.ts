import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stage 13 data-minimization tests for the admin user-detail read.
 *
 * The final Stage 13 audit found `getUserDetail` selecting `*` from `users` and
 * from all three profile tables. On this schema that returns not just the
 * contact PII the audit named (`phone_number`) but also the live payment-provider
 * account identifiers `stripe_customer_id`, `stripe_connect_account_id` and
 * `razorpay_account_id`, which no admin screen renders.
 *
 * The fix replaces each `select('*')` with a named column list. These tests
 * verify the result end to end: the fake database below HONORS the requested
 * column list and projects each row down to it, exactly as PostgREST does. So
 * `result.user` is precisely what the admin API would serialize, and asserting
 * `phone_number` is absent is a statement about the response rather than about
 * an intention in the source.
 *
 * Authorization is deliberately re-verified here too, because narrowing a
 * projection is exactly the kind of edit that can quietly drop the
 * `requireAdmin` call on the way through.
 */

type Row = Record<string, unknown>;

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const TARGET = '00000000-0000-4000-8000-0000000000aa';

let db: Record<string, Row[]>;
let selects: Array<{ table: string; columns: string }>;
let reads: string[];

/** Project a row down to the requested columns, as PostgREST does. */
function project(row: Row, columns: string): Row {
  const wanted = columns.split(',').map((c) => c.trim()).filter(Boolean);
  const out: Row = {};
  for (const col of wanted) {
    if (col === '*') return { ...row };
    if (col in row) out[col] = row[col];
  }
  return out;
}

function makeQuery(table: string, columns: string, filters: [string, unknown][], single: boolean) {
  const state: { columns: string; filters: [string, unknown][]; single: boolean } = {
    columns,
    filters,
    single,
  };

  const resolve = () => {
    reads.push(table);
    selects.push({ table, columns: state.columns });
    const rows = (db[table] ?? []).filter((r) => state.filters.every(([c, v]) => r[c] === v));
    if (state.single) {
      const row = rows[0];
      return { data: row ? project(row, state.columns) : null, error: null, count: rows.length };
    }
    return { data: rows.map((r) => project(r, state.columns)), error: null, count: rows.length };
  };

  // supabase-js query builders are chainable, so each method returns the same
  // object and the result is produced only when the chain is awaited or
  // terminated by single()/maybeSingle().
  const api: Record<string, unknown> = {
    select: (cols: string) => {
      state.columns = cols;
      return api;
    },
    eq: (col: string, val: unknown) => {
      state.filters.push([col, val]);
      return api;
    },
    single: async () => {
      state.single = true;
      return resolve();
    },
    maybeSingle: async () => {
      state.single = true;
      return resolve();
    },
    then: (res: (v: unknown) => void) => res(resolve()),
  };
  return api;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeQuery(table, '*', [], false),
  }),
}));

import { AdminService, ADMIN_USER_DETAIL_COLUMNS } from '@/services/admin.service';
import { ForbiddenError, UnauthorizedError, NotFoundError } from '@/lib/errors';

function seed() {
  db = {
    users: [
      {
        id: ADMIN,
        email: 'admin@example.test',
        role: 'admin',
        status: 'active',
        is_email_verified: true,
        phone_number: '+91-90000-00000',
        last_login_at: '2026-01-01T00:00:00.000Z',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: TARGET,
        email: 'subject@example.test',
        role: 'consultant',
        status: 'active',
        is_email_verified: false,
        phone_number: '+91-91111-11111',
        last_login_at: null,
        created_at: '2025-06-01T00:00:00.000Z',
        updated_at: '2025-06-01T00:00:00.000Z',
      },
    ],
    profiles: [
      {
        id: 'p1',
        user_id: TARGET,
        first_name: 'Asha',
        last_name: 'Rao',
        display_name: 'Asha Rao',
        avatar_url: null,
        timezone: 'IST',
        country_code: 'IN',
        city: 'Pune',
        bio_summary: 'SAP CPI specialist',
        created_at: '2025-06-01T00:00:00.000Z',
        updated_at: '2025-06-02T00:00:00.000Z',
      },
    ],
    client_profiles: [],
    consultant_profiles: [
      {
        id: 'cp1',
        user_id: TARGET,
        professional_headline: 'Integration Engineer',
        years_sap_experience: 6.5,
        years_cpi_experience: 5,
        hourly_rate_cents: 12000,
        min_project_size_cents: 500000,
        availability_status: 'available',
        available_hours_per_week: 30,
        github_profile_url: null,
        linkedin_profile_url: 'https://linkedin.example/asha',
        overview_markdown: 'Ten years in SAP.',
        avg_rating: 4.8,
        total_reviews_count: 12,
        completed_contracts_count: 7,
        stripe_connect_account_id: 'acct_1SECRET',
        razorpay_account_id: 'rzp_1SECRET',
        payouts_enabled: true,
        profile_score: 90,
        created_at: '2025-06-01T00:00:00.000Z',
        updated_at: '2025-06-02T00:00:00.000Z',
      },
    ],
  };
  selects = [];
  reads = [];
}

beforeEach(() => seed());

// ===========================================================================
// The projection is explicit
// ===========================================================================

describe('Stage 13: the admin user detail uses an explicit column list', () => {
  it('never selects * on any of the four tables', async () => {
    await AdminService.getUserDetail(ADMIN, TARGET);
    const detailReads = selects.filter((s) => s.table !== 'users' || s.columns !== 'id, email, role, status');
    expect(selects.length).toBeGreaterThan(0);
    // requireAdmin's own narrow select is allowed; nothing may be a bare `*`.
    expect(detailReads.every((s) => s.columns !== '*')).toBe(true);
  });

  it('uses the named constant for the users table', async () => {
    await AdminService.getUserDetail(ADMIN, TARGET);
    // requireAdmin issues its own narrow users select; the detail read is the other one.
    const userSelects = selects.filter((s) => s.table === 'users');
    const userSelect = userSelects[userSelects.length - 1];
    expect(userSelect?.columns).toBe(ADMIN_USER_DETAIL_COLUMNS);
  });
});

// ===========================================================================
// Least data: what must not be returned
// ===========================================================================

describe('Stage 13: the detail response omits PII and payment identifiers', () => {
  it('does not expose phone_number', async () => {
    const result = await AdminService.getUserDetail(ADMIN, TARGET);
    expect(result.user).not.toHaveProperty('phone_number');
    expect(JSON.stringify(result)).not.toContain('+91-91111-11111');
  });

  it('does not expose payment-provider account identifiers', async () => {
    const result = await AdminService.getUserDetail(ADMIN, TARGET);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('acct_1SECRET');
    expect(serialised).not.toContain('rzp_1SECRET');
    expect(result.consultant_profile).not.toHaveProperty('stripe_connect_account_id');
    expect(result.consultant_profile).not.toHaveProperty('razorpay_account_id');
  });

  it('does not expose a client profile stripe id when one exists', async () => {
    db.client_profiles = [
      {
        id: 'cl1',
        user_id: TARGET,
        company_id: 'co1',
        job_title: 'Head of Integration',
        department: 'IT',
        billing_email: 'ap@example.test',
        stripe_customer_id: 'cus_1SECRET',
        payment_verified: true,
        total_spent_cents: 500000,
        active_contracts_count: 1,
        avg_rating: 4.9,
        total_reviews_count: 4,
        completed_contracts_count: 3,
        created_at: '2025-06-01T00:00:00.000Z',
      },
    ];
    const result = await AdminService.getUserDetail(ADMIN, TARGET);
    expect(JSON.stringify(result)).not.toContain('cus_1SECRET');
  });
});

// ===========================================================================
// Least data is not "no data": the dashboard must still work
// ===========================================================================

describe('Stage 13: the fields the dashboard needs are still returned', () => {
  it('keeps moderation-relevant account state', async () => {
    const result = await AdminService.getUserDetail(ADMIN, TARGET);
    expect(result.user).toMatchObject({
      id: TARGET,
      email: 'subject@example.test',
      role: 'consultant',
      status: 'active',
      is_email_verified: false,
      created_at: '2025-06-01T00:00:00.000Z',
    });
  });

  it('keeps the profile identity fields', async () => {
    const result = await AdminService.getUserDetail(ADMIN, TARGET);
    expect(result.profile).toMatchObject({
      display_name: 'Asha Rao',
      country_code: 'IN',
      city: 'Pune',
    });
  });

  it('keeps the payout-state booleans a reviewer needs', async () => {
    const result = await AdminService.getUserDetail(ADMIN, TARGET);
    // The boolean is moderation data; the provider's account id is not.
    expect(result.consultant_profile).toMatchObject({ payouts_enabled: true });
    expect(result.consultant_profile).not.toHaveProperty('stripe_connect_account_id');
  });

  it('returns null for a profile the user does not have', async () => {
    db.consultant_profiles = [];
    const result = await AdminService.getUserDetail(ADMIN, TARGET);
    expect(result.consultant_profile).toBeNull();
    expect(result.client_profile).toBeNull();
  });
});

// ===========================================================================
// Authorization is unchanged
// ===========================================================================

describe('Stage 13: narrowing the projection did not weaken authorization', () => {
  it('refuses a non-admin before reading any detail', async () => {
    db.users[1].role = 'consultant';
    await expect(AdminService.getUserDetail(TARGET, ADMIN)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    // The read must not have happened at all.
    expect(reads.filter((t) => t === 'profiles' || t === 'client_profiles')).toHaveLength(0);
  });

  it('refuses a suspended administrator', async () => {
    db.users[0].status = 'suspended';
    // Suspension removes real power, not just sign-in, so the read is refused
    // rather than merely discouraged.
    await expect(AdminService.getUserDetail(ADMIN, TARGET)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it('refuses an unknown caller', async () => {
    await expect(
      AdminService.getUserDetail('00000000-0000-4000-8000-0000000000ff', TARGET)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('404s for a user that does not exist', async () => {
    await expect(
      AdminService.getUserDetail(ADMIN, '00000000-0000-4000-8000-0000000000ff')
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
