import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stage 12 remediation tests, part 3: the four events that previously had no
 * production call site.
 *
 * The earlier suite asserted coverage against `REQUIRED_EVENT_COVERAGE`, a map
 * declared in the same module as the builders, so it passed while four events
 * were never detected. These tests instead drive the real business services and
 * assert that a notification row is actually written.
 *
 * They also cover the unbound-`this` defect these tests first exposed: `emit` is
 * a static method using `this`, and the typed builders take it as a parameter.
 * Passing the bare method threw a TypeError on the first `this.…` access, which
 * every call site swallowed in its try/catch — so notifications silently never
 * happened while every test that did not drive the real path stayed green.
 */

type Result = { data: unknown; error: unknown };

const { mockInApp, mockEmail } = vi.hoisted(() => ({
  mockInApp: { name: 'in_app', isConfigured: vi.fn(() => true), deliver: vi.fn() },
  mockEmail: { name: 'email', isConfigured: vi.fn(() => true), deliver: vi.fn() },
}));

vi.mock('@/lib/notifications/channels', () => ({
  ALL_CHANNELS: [],
  getChannel: (name: string) =>
    name === 'in_app' ? mockInApp : name === 'email' ? mockEmail : undefined,
  registeredChannelNames: () => ['in_app', 'email'],
  availableChannels: () => [mockInApp, mockEmail],
  inAppChannel: mockInApp,
  emailChannel: mockEmail,
}));

let notificationInserts: Array<Record<string, unknown>> = [];
let committedKeys = new Set<string>();

/** Rows the mocked tables return, keyed by table. */
let rows: Record<string, unknown[]> = {};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

// `createProposal` opens a session client before it does anything else, which
// needs a Next request scope. There is no request here, so it is stubbed; the
// proposal path uses the admin client for every read and write under test.
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}));

function builder(table: string) {
  let lastWrite: Result | null = null;
  let pending: unknown = null;
  let isInsert = false;

  const settle = async (): Promise<{ result: Result; settled: boolean }> => {
    if (!isInsert) return { result: api._result as Result, settled: false };
    isInsert = false;
    const row = pending as Record<string, unknown>;
    pending = null;
    if (table === 'notifications') {
      await Promise.resolve();
      const key = row.dedup_key as string | null;
      if (key && committedKeys.has(key)) {
        return { result: { data: null, error: { code: '23505' } }, settled: true };
      }
      if (key) committedKeys.add(key);
      const created = { id: `n${notificationInserts.length + 1}`, ...row };
      notificationInserts.push(created);
      return { result: { data: created, error: null }, settled: true };
    }
    return { result: { data: row, error: null }, settled: true };
  };

  const readSingle = (): Result => {
    const primed = rows[table];
    const single = Array.isArray(primed) ? primed[0] ?? null : primed ?? null;
    return { data: single, error: null };
  };

  const api: Record<string, unknown> = {
    _result: { data: null, error: null } as Result,
    select: (...args: unknown[]) => {
      if (lastWrite) {
        api._result = lastWrite;
        return api;
      }
      // PostgREST `select(cols)` with a shape hint; the mock returns the rows it
      // has been primed with for this table.
      const primed = rows[table] ?? [];
      api._result = {
        data: Array.isArray(primed) ? primed : primed,
        error: null,
      };
      void args;
      return api;
    },
    insert: (payload: unknown) => {
      pending = payload;
      isInsert = true;
      return api;
    },
    upsert: (payload: unknown) => {
      lastWrite = { data: payload, error: null };
      api._result = lastWrite;
      return api;
    },
    update: (payload: unknown) => {
      lastWrite = { data: payload, error: null };
      api._result = lastWrite;
      return api;
    },
    delete: () => api,
    rpc: () => api,
    eq: () => api,
    is: () => api,
    gte: () => api,
    in: () => api,
    or: () => api,
    order: () => api,
    range: () => api,
    single: async () => {
      const { result, settled } = await settle();
      return settled ? result : readSingle();
    },
    maybeSingle: async () => {
      const { result, settled } = await settle();
      return settled ? result : readSingle();
    },
    then: (resolve: (v: Result) => unknown) => {
      void settle().then(({ result, settled }) => resolve(settled ? result : (api._result as Result)));
      return undefined;
    },
  };
  return api;
}

import { ContractService } from '@/services/contract.service';
import { ProposalService } from '@/services/proposal.service';

const CLIENT_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONSULTANT_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENT_PROFILE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONSULTANT_PROFILE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONTRACT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function notificationOfType(type: string) {
  return notificationInserts.find((row) => row.type === type);
}

beforeEach(() => {
  vi.clearAllMocks();
  notificationInserts = [];
  committedKeys = new Set();
  mockInApp.isConfigured.mockReturnValue(true);
  mockEmail.isConfigured.mockReturnValue(true);
  mockInApp.deliver.mockResolvedValue({ status: 'sent' });
  mockEmail.deliver.mockResolvedValue({ status: 'sent' });
  rows = {
    client_profiles: [{ id: CLIENT_PROFILE, user_id: CLIENT_USER }],
    consultant_profiles: [{ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }],
    profiles: [{ display_name: 'A Participant' }],
    users: [{ email: 'someone@example.com' }],
    notification_preferences: [],
    notification_deliveries: [],
  };
});

// ===========================================================================
// TEST 7 — previously unwired events
// ===========================================================================

describe('TEST 7a: a new proposal notifies the job owner', () => {
  it('emits proposal_received addressed to the client who owns the job', async () => {
    rows.jobs = [
      { id: 'job-1', client_id: CLIENT_PROFILE, title: 'SAP CPI integration', status: 'open' },
    ];

    await ProposalService.createProposal(CONSULTANT_USER, {
      job_id: 'job-1',
      cover_letter_markdown: 'Hello',
      technical_solution_markdown: 'Approach',
      proposed_duration_weeks: 4,
      proposed_price_cents: 500000,
    } as never);

    const notification = notificationOfType('proposal_received');
    expect(notification).toBeDefined();
    // The recipient is derived from jobs.client_id, never from the caller.
    expect(notification?.user_id).toBe(CLIENT_USER);
    expect(notification?.entity_id).toBeDefined();
  });

  it('does not notify about a draft proposal', async () => {
    rows.jobs = [
      { id: 'job-2', client_id: CLIENT_PROFILE, title: 'Draft job', status: 'open' },
    ];

    await ProposalService.createProposal(CONSULTANT_USER, {
      job_id: 'job-2',
      cover_letter_markdown: 'Draft',
      technical_solution_markdown: 'Draft',
      proposed_duration_weeks: 2,
      proposed_price_cents: 100000,
      status: 'draft',
    } as never);

    // A draft is the consultant's own working copy; telling the client would
    // leak a half-written pitch.
    expect(notificationOfType('proposal_received')).toBeUndefined();
  });
});

describe('TEST 7b: a created milestone notifies the consultant', () => {
  it('emits milestone_created after the milestone row is written', async () => {
    rows.contracts = [
      { id: CONTRACT_ID, status: 'active', client_id: CLIENT_PROFILE, consultant_id: CONSULTANT_PROFILE, title: 'Engagement' },
    ];

    await ContractService.createMilestone(CLIENT_USER, {
      contract_id: CONTRACT_ID,
      title: 'Discovery',
      description: '',
      amount_cents: 100000,
      due_date: '2026-09-01',
      sequence_order: 1,
    });

    const notification = notificationOfType('milestone_created');
    expect(notification).toBeDefined();
    expect(notification?.user_id).toBe(CONSULTANT_USER);
  });
});

describe('TEST 7c: a disputed contract notifies the counterparty', () => {
  it('emits dispute_opened addressed to the other party, not the actor', async () => {
    rows.contracts = [
      {
        id: CONTRACT_ID,
        status: 'active',
        client_id: CLIENT_PROFILE,
        consultant_id: CONSULTANT_PROFILE,
        title: 'Engagement',
      },
    ];

    // The consultant disputes. The client is the respondent and must be told.
    await ContractService.transitionContract(CONTRACT_ID, CONSULTANT_USER, 'disputed');

    const notification = notificationOfType('dispute_opened');
    expect(notification).toBeDefined();
    expect(notification?.user_id).toBe(CLIENT_USER);
  });

  it('tells the client when the client is the one disputing, so the consultant hears', async () => {
    rows.contracts = [
      {
        id: CONTRACT_ID,
        status: 'active',
        client_id: CLIENT_PROFILE,
        consultant_id: CONSULTANT_PROFILE,
        title: 'Engagement',
      },
    ];

    await ContractService.transitionContract(CONTRACT_ID, CLIENT_USER, 'disputed');

    const notification = notificationOfType('dispute_opened');
    expect(notification?.user_id).toBe(CONSULTANT_USER);
  });
});

describe('TEST 7d: a notification failure does not fail the business write', () => {
  it('still returns the contract when the notification path throws', async () => {
    rows.contracts = [
      {
        id: CONTRACT_ID,
        status: 'active',
        client_id: CLIENT_PROFILE,
        consultant_id: CONSULTANT_PROFILE,
        title: 'Engagement',
      },
    ];
    mockInApp.deliver.mockRejectedValue(new Error('channel exploded'));

    const contract = await ContractService.transitionContract(
      CONTRACT_ID,
      CONSULTANT_USER,
      'disputed'
    );

    // The state change is committed; a channel failure is contained.
    expect(contract).toBeTruthy();
  });
});
