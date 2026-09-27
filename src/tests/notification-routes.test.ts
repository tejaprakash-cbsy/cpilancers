import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level tests for the Stage 12 notification and preference endpoints.
 *
 * These close the gap the final Stage 12 audit named: the service had a deep
 * unit-test suite, but the endpoints exposing it had almost none. A service that
 * is entirely correct still fails in production if the route hands it the wrong
 * identifier, reads identity from the request body, or forgets to authenticate.
 *
 * Every test drives the REAL exported handler with a real `NextRequest` and
 * asserts on what actually reaches the service, which is the only layer where
 * those three classes of bug live. The service is mocked because these are
 * routing/authorization tests; its database behaviour is covered by
 * `notification-dedup.test.ts` and `notification-service.test.ts`.
 *
 * Follows the precedent of `review-routes.test.ts`, which exists for the same
 * reason: the Stage 11 audit found three non-functional endpoints sitting behind
 * a green unit-test suite.
 */

// ---------------------------------------------------------------------------
// Mocks. Declared before importing the handlers so the modules pick them up.
// ---------------------------------------------------------------------------

const mockGetCurrentUser = vi.fn();
const mockListNotifications = vi.fn();
const mockGetUnreadCount = vi.fn();
const mockSetReadState = vi.fn();
const mockMarkAllAsRead = vi.fn();
const mockGetPreferences = vi.fn();
const mockSetPreference = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args) },
}));

vi.mock('@/services/notification.service', () => ({
  NotificationService: {
    listNotifications: (...args: unknown[]) => mockListNotifications(...args),
    getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
    setReadState: (...args: unknown[]) => mockSetReadState(...args),
    markAllAsRead: (...args: unknown[]) => mockMarkAllAsRead(...args),
    getPreferences: (...args: unknown[]) => mockGetPreferences(...args),
    setPreference: (...args: unknown[]) => mockSetPreference(...args),
    emit: vi.fn(),
    emitEvent: vi.fn(),
  },
}));

import { GET as LIST_NOTIFICATIONS } from '@/app/api/notifications/route';
import { PATCH as PATCH_NOTIFICATION } from '@/app/api/notifications/[id]/route';
import { GET as UNREAD_COUNT } from '@/app/api/notifications/unread-count/route';
import { POST as READ_ALL } from '@/app/api/notifications/read-all/route';
import { GET as GET_PREFS, PATCH as PATCH_PREFS } from '@/app/api/notification-preferences/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTIFICATION_A = '11111111-1111-4111-8111-111111111111';
const NOTIFICATION_B = '22222222-2222-4222-8222-222222222222';

const userA = { id: USER_A, role: 'client' as const };
const userB = { id: USER_B, role: 'consultant' as const };

function patchNotification(body: unknown, path = `/api/notifications/${NOTIFICATION_A}`) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function get(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function patchPrefs(body: unknown) {
  return new NextRequest('http://localhost/api/notification-preferences', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(userA);
  mockListNotifications.mockResolvedValue({ notifications: [], total: 0 });
  mockGetUnreadCount.mockResolvedValue(0);
  mockMarkAllAsRead.mockResolvedValue({ updated: 0 });
  mockGetPreferences.mockResolvedValue({ preferences: {}, overrides: [] });
  mockSetPreference.mockResolvedValue({
    user_id: USER_A,
    type: 'proposal_received',
    channel: 'email',
    enabled: true,
  });
  mockSetReadState.mockResolvedValue({
    id: NOTIFICATION_A,
    is_read: true,
    read_at: '2026-01-02T00:00:00.000Z',
  });
});

// ===========================================================================
// Authentication
// ===========================================================================

describe('Stage 12: unauthenticated notification requests are refused', () => {
  it('refuses GET /api/notifications', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await LIST_NOTIFICATIONS(get('/api/notifications'));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
    // The service must not be reached at all without a session.
    expect(mockListNotifications).not.toHaveBeenCalled();
  });

  it('refuses PATCH /api/notifications/[id]', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await PATCH_NOTIFICATION(patchNotification({ is_read: true }));
    expect(res.status).toBe(401);
    expect(mockSetReadState).not.toHaveBeenCalled();
  });

  it('refuses GET /api/notifications/unread-count', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await UNREAD_COUNT();
    expect(res.status).toBe(401);
    expect(mockGetUnreadCount).not.toHaveBeenCalled();
  });

  it('refuses POST /api/notifications/read-all', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await READ_ALL();
    expect(res.status).toBe(401);
    expect(mockMarkAllAsRead).not.toHaveBeenCalled();
  });

  it('refuses GET /api/notification-preferences', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET_PREFS();
    expect(res.status).toBe(401);
    expect(mockGetPreferences).not.toHaveBeenCalled();
  });

  it('refuses PATCH /api/notification-preferences', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await PATCH_PREFS(
      patchPrefs({ type: 'proposal_received', channel: 'email', enabled: true })
    );
    expect(res.status).toBe(401);
    expect(mockSetPreference).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Notification id extraction
// ===========================================================================

describe('Stage 12: the notification id comes from the route, never the body', () => {
  it('passes the leaf path segment to the service', async () => {
    const res = await PATCH_NOTIFICATION(patchNotification({ is_read: true }));
    expect(res.status).toBe(200);
    expect(mockSetReadState).toHaveBeenCalledTimes(1);
    // Argument 1 is the id. This is the assertion that catches a regression back
    // to `.at(-2)`, which would send the literal "notifications".
    expect(mockSetReadState.mock.calls[0][1]).toBe(NOTIFICATION_A);
  });

  it('distinguishes two different notification ids', async () => {
    mockSetReadState.mockResolvedValue({
      id: NOTIFICATION_B,
      is_read: true,
      read_at: '2026-01-02T00:00:00.000Z',
    });
    await PATCH_NOTIFICATION(
      patchNotification({ is_read: true }, `/api/notifications/${NOTIFICATION_B}`)
    );
    expect(mockSetReadState.mock.calls[0][1]).toBe(NOTIFICATION_B);
  });

  it('does not let body.notificationId override the route parameter', async () => {
    // The body schema is `.strict()`, so an extra key is a 400. Even setting that
    // aside, the id passed to the service must be the path segment, because the
    // route is the only trustworthy source of identity.
    const res = await PATCH_NOTIFICATION(
      patchNotification({ is_read: true, notificationId: NOTIFICATION_B })
    );
    expect(res.status).toBe(400);
    expect(mockSetReadState).not.toHaveBeenCalled();
  });

  it.each([
    ['user_id', { is_read: true, user_id: USER_B }],
    ['id', { is_read: true, id: NOTIFICATION_B }],
    ['userId', { is_read: true, userId: USER_B }],
  ])('rejects a body carrying %s, so identity cannot be redirected', async (_label, body) => {
    const res = await PATCH_NOTIFICATION(patchNotification(body));
    expect(res.status).toBe(400);
    expect(mockSetReadState).not.toHaveBeenCalled();
  });

  it('rejects a malformed id with 400 and never calls the service', async () => {
    const res = await PATCH_NOTIFICATION(
      patchNotification({ is_read: true }, '/api/notifications/not-a-uuid')
    );
    expect(res.status).toBe(400);
    expect(mockSetReadState).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Cross-user access
// ===========================================================================

describe("Stage 12: a user cannot reach another user's notification", () => {
  it('scopes the read-state write to the authenticated user, not a body value', async () => {
    await PATCH_NOTIFICATION(patchNotification({ is_read: true }));
    // Argument 0 is always the session user id.
    expect(mockSetReadState.mock.calls[0][0]).toBe(USER_A);
  });

  it('scopes the feed read to the authenticated user', async () => {
    await LIST_NOTIFICATIONS(get('/api/notifications'));
    expect(mockListNotifications.mock.calls[0][0]).toBe(USER_A);
  });

  it('scopes the unread count to the authenticated user', async () => {
    await UNREAD_COUNT();
    expect(mockGetUnreadCount).toHaveBeenCalledWith(USER_A);
  });

  it('scopes read-all to the authenticated user', async () => {
    await READ_ALL();
    expect(mockMarkAllAsRead).toHaveBeenCalledWith(USER_A);
  });

  it('scopes preferences to the authenticated user on both verbs', async () => {
    await GET_PREFS();
    expect(mockGetPreferences).toHaveBeenCalledWith(USER_A);

    await PATCH_PREFS(
      patchPrefs({ type: 'proposal_received', channel: 'email', enabled: true })
    );
    expect(mockSetPreference.mock.calls[0][0]).toBe(USER_A);
  });

  it('does not accept a user id in the preferences body', async () => {
    // There is no user id in the PATCH schema, so one cannot be smuggled in to
    // edit another account's settings.
    const res = await PATCH_PREFS(
      patchPrefs({
        type: 'proposal_received',
        channel: 'email',
        enabled: true,
        user_id: USER_B,
      })
    );
    expect(res.status).toBe(400);
    expect(mockSetPreference).not.toHaveBeenCalled();
  });

  it('surfaces the service 404 for a notification the caller does not own', async () => {
    // The service scopes its update by (id, user_id), so User B asking for User
    // A's notification matches no row. That is a 404, and deliberately the same
    // 404 a genuinely missing id returns, so the response cannot be used to
    // confirm that someone else's notification exists.
    const { NotFoundError } = await import('@/lib/errors');
    mockSetReadState.mockRejectedValue(new NotFoundError('Notification'));
    mockGetCurrentUser.mockResolvedValue(userB);
    const res = await PATCH_NOTIFICATION(
      patchNotification({ is_read: true }, `/api/notifications/${NOTIFICATION_A}`)
    );

    expect(res.status).toBe(404);
    // User B is the one passed to the service; the id is User A's notification.
    expect(mockSetReadState.mock.calls[0][0]).toBe(USER_B);
    expect(mockSetReadState.mock.calls[0][1]).toBe(NOTIFICATION_A);
  });
});

// ===========================================================================
// PATCH read state
// ===========================================================================

describe('Stage 12: PATCH reports the state that was actually persisted', () => {
  it('round-trips unread -> read', async () => {
    // The service returns the row it wrote; the route must echo that value
    // rather than the value it was asked for.
    mockSetReadState.mockResolvedValue({
      id: NOTIFICATION_A,
      is_read: true,
      read_at: '2026-01-02T00:00:00.000Z',
    });
    const res = await PATCH_NOTIFICATION(patchNotification({ is_read: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSetReadState.mock.calls[0][2]).toBe(true);
    expect(body.data.is_read).toBe(true);
    expect(body.data.read_at).toBe('2026-01-02T00:00:00.000Z');
  });

  it('round-trips read -> unread, and clears the timestamp', async () => {
    mockSetReadState.mockResolvedValue({
      id: NOTIFICATION_A,
      is_read: false,
      read_at: null,
    });
    const res = await PATCH_NOTIFICATION(patchNotification({ is_read: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSetReadState.mock.calls[0][2]).toBe(false);
    expect(body.data.is_read).toBe(false);
    // A stale timestamp on an unread row is what `chk_notification_read_state`
    // rejects, so the response must not claim one.
    expect(body.data.read_at).toBeNull();
  });

  it('reports the persisted value, not the requested one', async () => {
    // If the service ever clamps or ignores the request, the response must
    // describe the database, not the request. This is the regression that
    // previously let `PATCH {is_read:false}` answer "false" over a row the
    // service had written as `true`.
    mockSetReadState.mockResolvedValue({ id: NOTIFICATION_A, is_read: true, read_at: 'x' });
    const res = await PATCH_NOTIFICATION(patchNotification({ is_read: false }));
    const body = await res.json();
    expect(body.data.is_read).toBe(true);
  });

  it('defaults to marking read when the body is empty', async () => {
    const res = await PATCH_NOTIFICATION(patchNotification({}));
    expect(res.status).toBe(200);
    expect(mockSetReadState.mock.calls[0][2]).toBe(true);
  });

  it('rejects a non-boolean is_read rather than coercing it', async () => {
    const res = await PATCH_NOTIFICATION(patchNotification({ is_read: 'yes' }));
    expect(res.status).toBe(400);
    expect(mockSetReadState).not.toHaveBeenCalled();
  });

  it('only returns the three read-state fields, not the whole notification', async () => {
    mockSetReadState.mockResolvedValue({
      id: NOTIFICATION_A,
      user_id: USER_A,
      is_read: true,
      read_at: 'x',
      title: 'secret title',
      body: 'secret body',
      metadata: { internal: true },
      dedup_key: 'proposal_received:c:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const res = await PATCH_NOTIFICATION(patchNotification({ is_read: true }));
    const body = await res.json();

    expect(Object.keys(body.data).sort()).toEqual(['id', 'is_read', 'read_at']);
    expect(body.data).not.toHaveProperty('user_id');
    expect(body.data).not.toHaveProperty('metadata');
  });
});

// ===========================================================================
// Feed and preference contract details
// ===========================================================================

describe('Stage 12: feed and preference routes keep their contract', () => {
  it('returns the feed with pagination metadata', async () => {
    mockListNotifications.mockResolvedValue({
      notifications: [{ id: NOTIFICATION_A, is_read: false }],
      total: 1,
    });
    mockGetUnreadCount.mockResolvedValue(1);

    const res = await LIST_NOTIFICATIONS(get('/api/notifications?page=1&limit=20'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.unread_count).toBe(1);
    expect(body.data.pagination).toMatchObject({ total: 1, page: 1, limit: 20, pages: 1 });
  });

  it('caps the limit at 100 so a client cannot request an unbounded page', async () => {
    await LIST_NOTIFICATIONS(get('/api/notifications?limit=100000'));
    expect(mockListNotifications.mock.calls[0][1]).toMatchObject({ limit: 100 });
  });

  it('rejects an unknown notification type with 400 rather than an empty list', async () => {
    const res = await LIST_NOTIFICATIONS(get('/api/notifications?type=not_a_real_type'));
    expect(res.status).toBe(400);
    // An empty feed would be indistinguishable from "you have none".
    expect(mockListNotifications).not.toHaveBeenCalled();
  });

  it('maps unread=true onto the service filter', async () => {
    await LIST_NOTIFICATIONS(get('/api/notifications?unread=true'));
    expect(mockListNotifications.mock.calls[0][1]).toMatchObject({ unreadOnly: true });
  });

  it('returns just the count from the badge endpoint', async () => {
    mockGetUnreadCount.mockResolvedValue(7);
    const res = await UNREAD_COUNT();
    expect(await res.json()).toEqual({ success: true, data: { unread_count: 7 } });
  });

  it('rejects a preference for an unknown notification type', async () => {
    const res = await PATCH_PREFS(
      patchPrefs({ type: 'not_a_real_type', channel: 'email', enabled: true })
    );
    expect(res.status).toBe(400);
    expect(mockSetPreference).not.toHaveBeenCalled();
  });

  it('rejects a preference with extra keys', async () => {
    const res = await PATCH_PREFS(
      patchPrefs({ type: 'proposal_received', channel: 'email', enabled: true, type2: 'x' })
    );
    expect(res.status).toBe(400);
    expect(mockSetPreference).not.toHaveBeenCalled();
  });

  it('propagates the conflict for a locked in-app preference', async () => {
    // `setPreference` throws ConflictError for an essential event that cannot be
    // switched off. The route must surface 409, not a generic 500.
    const { ConflictError } = await import('@/lib/errors');
    mockSetPreference.mockRejectedValue(new ConflictError('This is required in-app.'));
    const res = await PATCH_PREFS(
      patchPrefs({ type: 'message_received', channel: 'in_app', enabled: false })
    );
    expect(res.status).toBe(409);
  });
});
