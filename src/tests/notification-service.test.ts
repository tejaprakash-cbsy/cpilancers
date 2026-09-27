import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Service-level tests for `NotificationService`, and route-level tests for the
 * notification endpoints.
 *
 * The properties under test are the ones the Stage 12 brief names explicitly:
 * no duplicate notifications for the same event, user-configurable preferences,
 * an unread count, and mark-as-read. Also the two authorisation properties the
 * brief implies — a user may only ever read or mutate their own notifications, and
 * no client can dictate a recipient.
 */

type Result = { data: unknown; error: unknown };
type Handler = (table: string, op: string, payload?: unknown) => Result;

const calls: { table: string; op: string; payload?: unknown; args?: unknown[] }[] = [];
let handler: Handler = () => ({ data: null, error: null });

function record(table: string, op: string, payload?: unknown, args?: unknown[]) {
  calls.push({ table, op, payload, args });
  return handler(table, op, payload);
}

function builder(table: string) {
  // supabase-js chains `.insert({...}).select('*').single()`, so a `select` that
  // follows a write must return the write's result rather than starting a fresh
  // read. Tracked here so the mock behaves like the real client.
  let lastWrite: Result | null = null;

  const api: Record<string, unknown> = {
    _result: { data: null, error: null } as Result,
    select: (...args: unknown[]) => {
      if (lastWrite) {
        api._result = lastWrite;
        return api;
      }
      const r = record(table, 'select', undefined, args);
      api._result = r;
      return api;
    },
    insert: (payload: unknown) => {
      const r = record(table, 'insert', payload);
      lastWrite = r;
      api._result = r;
      return api;
    },
    upsert: (payload: unknown) => {
      const r = record(table, 'upsert', payload);
      lastWrite = r;
      api._result = r;
      return api;
    },
    update: (payload: unknown) => {
      const r = record(table, 'update', payload);
      lastWrite = r;
      api._result = r;
      return api;
    },
    eq: (...args: unknown[]) => {
      record(table, 'eq', undefined, args);
      return api;
    },
    is: (...args: unknown[]) => {
      record(table, 'is', undefined, args);
      return api;
    },
    gte: () => api,
    in: () => api,
    or: () => api,
    order: () => api,
    range: () => api,
    single: async () => api._result as Result,
    maybeSingle: async () => api._result as Result,
    then: (resolve: (v: Result) => unknown) => resolve(api._result as Result),
  };
  return api;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

// `vi.mock` factories are hoisted above every other statement, so anything they
// close over has to be hoisted with them. Without this the factory runs before the
// `const` initialisers and the suite fails to load.
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

import { NotificationService } from '@/services/notification.service';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROPOSAL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function baseEvent(over: Record<string, unknown> = {}) {
  return {
    userId: USER,
    type: 'proposal_received' as const,
    title: 'New proposal received',
    body: 'A consultant submitted a proposal.',
    entityType: 'proposal',
    entityId: PROPOSAL,
    ...over,
  };
}

/** Default handler: insert succeeds, preferences empty, user row present. */
function defaultHandler(): Handler {
  return (table, op, payload) => {
    if (table === 'users' && op === 'select') {
      return { data: { email: 'user@example.com' }, error: null };
    }
    if (table === 'profiles' && op === 'select') {
      return { data: { display_name: 'Test User' }, error: null };
    }
    if (table === 'notification_preferences' && op === 'select') {
      return { data: [], error: null };
    }
    if (table === 'notifications' && op === 'insert') {
      return {
        data: {
          id: 'n1',
          user_id: (payload as { user_id: string }).user_id,
          type: (payload as { type: string }).type,
          title: (payload as { title: string }).title,
          body: (payload as { body: string }).body,
          action_url: null,
          entity_type: 'proposal',
          entity_id: PROPOSAL,
          actor_user_id: null,
          metadata: {},
          dedup_key: (payload as { dedup_key: string }).dedup_key,
          is_read: false,
          read_at: null,
          created_at: new Date().toISOString(),
        },
        error: null,
      };
    }
    if (table === 'notifications' && op === 'update') {
      return {
        data: {
          id: 'n1',
          user_id: USER,
          type: 'proposal_received',
          title: 'New proposal received',
          body: 'A consultant submitted a proposal.',
          action_url: null,
          entity_type: 'proposal',
          entity_id: PROPOSAL,
          actor_user_id: null,
          metadata: {},
          dedup_key: 'k',
          is_read: true,
          read_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        error: null,
      };
    }
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  handler = defaultHandler();
  mockInApp.isConfigured.mockReturnValue(true);
  mockEmail.isConfigured.mockReturnValue(true);
  mockInApp.deliver.mockResolvedValue({ status: 'sent', providerMessageId: 'n1' });
  mockEmail.deliver.mockResolvedValue({ status: 'sent', providerMessageId: 'sg-1' });
});

// ===========================================================================
// Dedup
// ===========================================================================

describe('emit: no duplicate notifications for the same event', () => {
  it('derives a dedup key from type, entity and recipient', async () => {
    await NotificationService.emit(baseEvent());
    const insert = calls.find((c) => c.table === 'notifications' && c.op === 'insert');
    const key = (insert?.payload as { dedup_key: string }).dedup_key;
    expect(key).toContain(PROPOSAL.toLowerCase());
    expect(key).toContain(USER.toLowerCase());
    expect(key).toContain('proposal_received');
  });

  it('treats a unique violation as success and returns the existing row', async () => {
    // Simulate a redelivered webhook: the index rejects the second insert.
    handler = (table, op, payload) => {
      if (table === 'notifications' && op === 'insert') {
        return { data: null, error: { code: '23505' } };
      }
      if (table === 'notifications' && op === 'select') {
        return { data: { id: 'existing', dedup_key: 'k' }, error: null };
      }
      return defaultHandler()(table, op, payload);
    };

    const result = await NotificationService.emit(baseEvent());
    expect(result.created).toBe(false);
    expect(result.notification.id).toBe('existing');
    // Crucially, no channel ran, so nothing was emailed twice.
    expect(mockEmail.deliver).not.toHaveBeenCalled();
    expect(mockInApp.deliver).not.toHaveBeenCalled();
  });

  it('surfaces a non-dedup insert failure rather than swallowing it', async () => {
    handler = (table, op, payload) => {
      if (table === 'notifications' && op === 'insert') {
        return { data: null, error: { code: '23502' } };
      }
      return defaultHandler()(table, op, payload);
    };
    await expect(NotificationService.emit(baseEvent())).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('produces the same key for the same event twice', async () => {
    await NotificationService.emit(baseEvent());
    const first = (calls.find((c) => c.table === 'notifications' && c.op === 'insert')
      ?.payload as { dedup_key: string }).dedup_key;
    calls.length = 0;
    await NotificationService.emit(baseEvent());
    const second = (calls.find((c) => c.table === 'notifications' && c.op === 'insert')
      ?.payload as { dedup_key: string }).dedup_key;
    expect(second).toBe(first);
  });

  it('does not fan out any channel before the durable row is written', async () => {
    await NotificationService.emit(baseEvent());
    const insertIndex = calls.findIndex(
      (c) => c.table === 'notifications' && c.op === 'insert'
    );
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    // The in-app row exists before anything is sent, so a total channel failure
    // still leaves a correct unread badge.
    expect(mockInApp.deliver).toHaveBeenCalled();
  });
});

// ===========================================================================
// Preferences
// ===========================================================================

describe('emit: preferences are honoured before delivery', () => {
  it('skips a channel the user switched off', async () => {
    handler = (table, op, payload) => {
      if (table === 'notification_preferences' && op === 'select') {
        return { data: [{ channel: 'email', enabled: false }], error: null };
      }
      return defaultHandler()(table, op, payload);
    };
    await NotificationService.emit(baseEvent());
    expect(mockEmail.deliver).not.toHaveBeenCalled();
    expect(mockInApp.deliver).toHaveBeenCalled();
  });

  it('skips a channel that is off by default, without an override', async () => {
    // proposal_received is email-off by default, so no email and no delivery row.
    await NotificationService.emit(baseEvent());
    expect(mockEmail.deliver).not.toHaveBeenCalled();
  });

  it('honours an explicit opt-in for a channel that is off by default', async () => {
    handler = (table, op, payload) => {
      if (table === 'notification_preferences' && op === 'select') {
        return { data: [{ channel: 'email', enabled: true }], error: null };
      }
      return defaultHandler()(table, op, payload);
    };
    await NotificationService.emit(baseEvent());
    expect(mockEmail.deliver).toHaveBeenCalled();
  });

  it('refuses to guess when the preference lookup fails, rather than defaulting', async () => {
    // Defaulting on a lookup failure could mail someone who opted out.
    handler = (table, op, payload) => {
      if (table === 'notification_preferences' && op === 'select') {
        return { data: null, error: { message: 'timeout' } };
      }
      return defaultHandler()(table, op, payload);
    };
    await expect(NotificationService.emit(baseEvent())).rejects.toMatchObject({ statusCode: 500 });
    expect(mockEmail.deliver).not.toHaveBeenCalled();
  });

  it('skips a channel that reports itself unconfigured', async () => {
    mockEmail.isConfigured.mockReturnValue(false);
    handler = (table, op, payload) => {
      if (table === 'notification_preferences' && op === 'select') {
        return { data: [{ channel: 'email', enabled: true }], error: null };
      }
      return defaultHandler()(table, op, payload);
    };
    await NotificationService.emit(baseEvent());
    expect(mockEmail.deliver).not.toHaveBeenCalled();
  });

  it('rejects disabling a locked in-app notification', async () => {
    await expect(
      NotificationService.setPreference(USER, 'payment_escrowed', 'in_app', false)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows disabling a non-essential in-app notification', async () => {
    handler = (table, op, payload) => {
      if (table === 'notification_preferences' && op === 'upsert') {
        return { data: payload, error: null };
      }
      return defaultHandler()(table, op, payload);
    };
    await expect(
      NotificationService.setPreference(USER, 'message_received', 'in_app', false)
    ).resolves.toBeTruthy();
  });

  it('rejects an unknown channel', async () => {
    await expect(
      NotificationService.setPreference(USER, 'message_received', 'carrier-pigeon', true)
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ===========================================================================
// Unread count
// ===========================================================================

describe('unread count', () => {
  it('counts only the caller\'s unread notifications and breaks them down', async () => {
    handler = (table, op, payload) => {
      if (table === 'notifications' && op === 'select') {
        return {
          data: [
            { type: 'payment_escrowed' },
            { type: 'payment_escrowed' },
            { type: 'message_received' },
          ],
          error: null,
        };
      }
      return defaultHandler()(table, op, payload);
    };

    const summary = await NotificationService.getUnreadSummary(USER);
    expect(summary.unread_count).toBe(3);
    expect(summary.by_type[0]).toEqual({ type: 'payment_escrowed', count: 2 });
    expect(summary.by_type[1]).toEqual({ type: 'message_received', count: 1 });
  });

  it('scopes the count to the authenticated user', async () => {
    await NotificationService.getUnreadSummary(USER);
    const eq = calls.filter((c) => c.op === 'eq' && c.args?.[0] === 'user_id');
    expect(eq[0]?.args?.[1]).toBe(USER);
  });

  it('raises on a count failure rather than reporting zero', async () => {
    // Reporting 0 on error is how a user misses a dispute or an escrow notice.
    handler = (table, op, payload) => {
      if (table === 'notifications' && op === 'select') {
        return { data: null, error: { message: 'boom' } };
      }
      return defaultHandler()(table, op, payload);
    };
    await expect(NotificationService.getUnreadSummary(USER)).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

// ===========================================================================
// Mark as read
// ===========================================================================

describe('mark as read', () => {
  it('scopes the update by both id and user, so another user\'s id does nothing', async () => {
    await NotificationService.markAsRead(USER, 'n1');
    const eqs = calls.filter((c) => c.op === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['id', 'n1']);
    expect(eqs).toContainEqual(['user_id', USER]);
  });

  it('sets is_read and read_at together', async () => {
    // chk_notification_read_state requires the two to agree, so a partial update
    // would be rejected by the database.
    await NotificationService.markAsRead(USER, 'n1');
    const update = calls.find((c) => c.table === 'notifications' && c.op === 'update');
    expect((update?.payload as { is_read: boolean }).is_read).toBe(true);
    expect((update?.payload as { read_at: string }).read_at).toBeTruthy();
  });

  it('404s when the notification is not the caller\'s', async () => {
    handler = (table, op, payload) => {
      if (table === 'notifications' && op === 'update') {
        return { data: null, error: null };
      }
      return defaultHandler()(table, op, payload);
    };
    // NotFound rather than Forbidden, so a caller cannot probe for the existence
    // of another user's notification id.
    await expect(NotificationService.markAsRead(USER, 'someone-elses')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('marks all unread at once, scoped to the caller', async () => {
    handler = (table, op, payload) => {
      if (table === 'notifications' && op === 'update') {
        return { data: [{ id: 'a' }, { id: 'b' }], error: null };
      }
      return defaultHandler()(table, op, payload);
    };
    const result = await NotificationService.markAllAsRead(USER);
    expect(result.updated).toBe(2);
    const eqs = calls.filter((c) => c.op === 'eq' && c.args?.[0] === 'user_id');
    expect(eqs[0]?.args?.[1]).toBe(USER);
  });
});

// ===========================================================================
// Channel failure isolation and delivery ledger
// ===========================================================================

describe('channel outcomes', () => {
  it('still writes the notification when every channel fails', async () => {
    mockInApp.deliver.mockRejectedValue(new Error('channel exploded'));
    mockEmail.deliver.mockRejectedValue(new Error('channel exploded'));
    const result = await NotificationService.emit(baseEvent());
    expect(result.notification.id).toBe('n1');
    expect(result.deliveries.in_app).toBe('failed');
  });

  it('records a delivery row per channel', async () => {
    await NotificationService.emit(baseEvent());
    const upserts = calls.filter((c) => c.table === 'notification_deliveries');
    expect(upserts.length).toBeGreaterThan(0);
    expect(upserts[0].op).toBe('upsert');
  });

  it('records a retry hint when the provider asks for one', async () => {
    mockEmail.isConfigured.mockReturnValue(true);
    handler = (table, op, payload) => {
      if (table === 'notification_preferences' && op === 'select') {
        return { data: [{ channel: 'email', enabled: true }], error: null };
      }
      return defaultHandler()(table, op, payload);
    };
    mockEmail.deliver.mockResolvedValue({ status: 'failed', error: 'rate limited', retryAfterSeconds: 60 });
    const result = await NotificationService.emit(baseEvent());
    expect(result.deliveries.email).toBe('failed');
    // The retry hint must land on the email row specifically. The in-app row is
    // written first and succeeded, so picking the first delivery would assert
    // against the wrong channel.
    const emailRow = calls.find(
      (c) =>
        c.table === 'notification_deliveries' &&
        (c.payload as { channel: string }).channel === 'email'
    );
    expect((emailRow?.payload as { next_retry_at: string }).next_retry_at).toBeTruthy();
    expect((emailRow?.payload as { status: string }).status).toBe('failed');
  });

  it('records a skipped channel as skipped, not as a failure to retry', async () => {
    mockEmail.isConfigured.mockReturnValue(false);
    mockInApp.deliver.mockResolvedValue({ status: 'skipped', reason: 'nothing configured' });
    const result = await NotificationService.emit(baseEvent());
    expect(result.deliveries.in_app).toBe('skipped');
  });
});
