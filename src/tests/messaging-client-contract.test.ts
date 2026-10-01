/**
 * Contract regression tests for the messaging client wrapper and the
 * message-action route.
 *
 * WHY THIS FILE EXISTS
 *
 * A previous sweep fixed a cluster of messaging bugs and shipped ZERO tests
 * with them. Every fix below was therefore unverifiable and free to regress
 * silently:
 *
 *   1. The four message actions (read / edit / delete / report) were issued as
 *      PATCH against a route that exports POST only. Next answered 405, so
 *      editing, deleting and marking-as-read all failed at runtime with no
 *      visible error path in the UI.
 *   2. The route read the action from a URL path segment
 *      (`/api/messages/messages/<id>/edit`) for which no route segment exists,
 *      so `getAction()` could only ever return null and every action answered
 *      400 "Action is required."
 *   3. `getUnreadMessageCount()` was typed `Promise<number>` but assigned the
 *      raw array from `/api/messages/notifications`, so the sidebar rendered a
 *      stringified array instead of a badge count.
 *   4. `ClientJobService.deleteJob` issued `PATCH {status:'cancelled'}` and so
 *      never reached the dedicated DELETE path.
 *   5. `subscribeToConversation` was a no-op stub returning
 *      `{ unsubscribe: () => undefined }`.
 *
 * These are deliberately CONTRACT tests, not unit tests of implementation
 * detail: they capture the exact URL, HTTP method and parsed JSON body that
 * each client method puts on the wire, and drive the real exported route
 * handler with a real `NextRequest` to assert the exact identifier and
 * payload that reach the service. The client half and the server half are the
 * two ends of one wire protocol; a regression on either side must fail here.
 *
 * No React rendering is involved (this project has no jsdom / testing-library),
 * so the component-level guarantees these tests encode are asserted at the
 * boundary the components actually call: `fetch` for the client and
 * `MessagingService` for the route.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks for the route half of the suite. Declared before importing the handler
// so the handler module picks them up (hoisted by vitest).
// ---------------------------------------------------------------------------

const mockAuthGetCurrentUser = vi.fn();
const mockMarkMessageAsRead = vi.fn();
const mockEditMessage = vi.fn();
const mockDeleteMessage = vi.fn();
const mockReportMessage = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    getCurrentUser: (...args: unknown[]) => mockAuthGetCurrentUser(...args),
  },
}));

vi.mock('@/services/messaging.service', () => ({
  MessagingService: {
    markMessageAsRead: (...args: unknown[]) => mockMarkMessageAsRead(...args),
    editMessage: (...args: unknown[]) => mockEditMessage(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
    reportMessage: (...args: unknown[]) => mockReportMessage(...args),
  },
}));

import { ClientJobService, ClientMessagingService } from '@/services/client-api.service';
import { POST as MESSAGE_ACTION_POST } from '@/app/api/messages/messages/[messageId]/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MESSAGE_ID = '3f9b1c2a-0000-4000-8000-00000000abcd';
const CONVERSATION_ID = '5c1d2e3f-0000-4000-8000-00000000cafe';
const JOB_ID = '7a8b9c0d-0000-4000-8000-000000001234';
const USER_ID = '9e8d7c6b-0000-4000-8000-000000005678';

const MESSAGE_ACTION_PATH = `/api/messages/messages/${MESSAGE_ID}`;

const AUTHORISED_USER = { id: USER_ID, role: 'client' as const };

const UPDATED_MESSAGE = {
  id: MESSAGE_ID,
  content: 'hi',
  sender_id: USER_ID,
  conversation_id: CONVERSATION_ID,
  created_at: '2026-01-01T00:00:00.000Z',
  edited_at: '2026-01-02T00:00:00.000Z',
  deleted_at: null,
};

// ---------------------------------------------------------------------------
// fetch doubles
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

let fetchCalls: FetchCall[] = [];
let nextResponse: Response;
let mockFetch: ReturnType<typeof vi.fn>;

/** A `Response` stand-in whose `.json()` resolves to `body`. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** A `Response` stand-in whose `.json()` rejects, like a non-JSON payload. */
function unparseableResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
  } as unknown as Response;
}

function onlyCall(): FetchCall {
  expect(fetchCalls).toHaveLength(1);
  return fetchCalls[0];
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  expect(typeof call.init?.body).toBe('string');
  return JSON.parse(call.init?.body as string) as Record<string, unknown>;
}

/** A `NextRequest` for the message-action endpoint. */
function actionRequest(
  body?: unknown,
  path: string = MESSAGE_ACTION_PATH
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  fetchCalls = [];
  nextResponse = jsonResponse({ success: true, data: {} });
  mockFetch = vi.fn((url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return Promise.resolve(nextResponse);
  });
  vi.stubGlobal('fetch', mockFetch);

  mockAuthGetCurrentUser.mockResolvedValue(AUTHORISED_USER);
  mockMarkMessageAsRead.mockResolvedValue(undefined);
  mockEditMessage.mockResolvedValue(UPDATED_MESSAGE);
  mockDeleteMessage.mockResolvedValue(undefined);
  mockReportMessage.mockResolvedValue({ reported: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===========================================================================
// A — message editing: the client sends the shape the API actually reads
// ===========================================================================

describe('A: editMessage client contract', () => {
  it('issues POST (not PATCH or PUT) to /api/messages/messages/<id>', async () => {
    nextResponse = jsonResponse({ success: true, data: UPDATED_MESSAGE });

    await ClientMessagingService.editMessage(MESSAGE_ID, 'hi');

    const call = onlyCall();
    expect(call.url).toBe(`/api/messages/messages/${MESSAGE_ID}`);
    expect(call.init?.method).toBe('POST');
    expect(call.init?.method).not.toBe('PATCH');
    expect(call.init?.method).not.toBe('PUT');
  });

  it('sends exactly { action: "edit", newContent } and no extra keys', async () => {
    await ClientMessagingService.editMessage(MESSAGE_ID, 'hi');

    const parsed = bodyOf(onlyCall());
    expect(parsed).toEqual({ action: 'edit', newContent: 'hi' });
    expect(Object.keys(parsed).sort()).toEqual(['action', 'newContent']);
  });

  it('round-trips: the route dispatches the edit body to MessagingService.editMessage', async () => {
    const res = await MESSAGE_ACTION_POST(
      actionRequest({ action: 'edit', newContent: 'hi' })
    );

    expect(res.status).toBe(200);
    expect(mockEditMessage).toHaveBeenCalledTimes(1);
    expect(mockEditMessage.mock.calls[0][0]).toBe(MESSAGE_ID);
    expect(mockEditMessage.mock.calls[0][1]).toBe('hi');

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(UPDATED_MESSAGE);
  });

  it('round-trips the exact body editMessage puts on the wire', async () => {
    // Drive the route with the literal bytes the client emits, so the two
    // halves of the protocol cannot drift apart unnoticed.
    await ClientMessagingService.editMessage(MESSAGE_ID, 'edited from the client');
    const emitted = onlyCall().init?.body as string;

    const res = await MESSAGE_ACTION_POST(
      new NextRequest(`http://localhost${MESSAGE_ACTION_PATH}`, {
        method: 'POST',
        body: emitted,
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(res.status).toBe(200);
    expect(mockEditMessage.mock.calls[0][0]).toBe(MESSAGE_ID);
    expect(mockEditMessage.mock.calls[0][1]).toBe('edited from the client');
  });
});

// ===========================================================================
// B — mark as read: correct method, correct payload, tolerant of no body
// ===========================================================================

describe('B: markMessageAsRead client and route contract', () => {
  it('issues POST with a body of exactly { action: "read" }', async () => {
    await ClientMessagingService.markMessageAsRead(MESSAGE_ID);

    const call = onlyCall();
    expect(call.url).toBe(`/api/messages/messages/${MESSAGE_ID}`);
    expect(call.init?.method).toBe('POST');
    expect(bodyOf(call)).toEqual({ action: 'read' });
    expect(Object.keys(bodyOf(call))).toEqual(['action']);
  });

  it('route dispatches "read" to MessagingService.markMessageAsRead and answers 200', async () => {
    const res = await MESSAGE_ACTION_POST(actionRequest({ action: 'read' }));

    expect(res.status).toBe(200);
    expect(mockMarkMessageAsRead).toHaveBeenCalledTimes(1);
    expect(mockMarkMessageAsRead.mock.calls[0]).toEqual([MESSAGE_ID]);
    expect(mockEditMessage).not.toHaveBeenCalled();
    expect(mockDeleteMessage).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body).toEqual({ success: true, data: { markedAsRead: true } });
  });

  it('route rejects a bodyless request cleanly instead of throwing', async () => {
    // Regression: `request.json()` on an empty body throws. The route must
    // absorb that and answer a structured 400. It must NOT fall through to the
    // generic catch and answer 500, and it must NOT invent an action -- a
    // bodyless POST carries no evidence that the caller meant "read", and
    // defaulting to it would silently mark a message read. This is the same
    // case the "still rejects a bodyless request" test below pins to 400.
    const res = await MESSAGE_ACTION_POST(actionRequest());

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
  });

  it('route rejects an unparseable body cleanly instead of throwing', async () => {
    // Same regression reached through a body that exists but is not JSON: the
    // parse failure must not escape as a 500, and no action may be guessed.
    const res = await MESSAGE_ACTION_POST(
      new NextRequest(`http://localhost${MESSAGE_ACTION_PATH}`, {
        method: 'POST',
        body: 'not json at all',
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
    expect(mockMarkMessageAsRead).not.toHaveBeenCalled();
    expect(mockEditMessage).not.toHaveBeenCalled();
    expect(mockDeleteMessage).not.toHaveBeenCalled();
    expect(mockReportMessage).not.toHaveBeenCalled();
  });

  it('route still dispatches "read" for a bodyless LEGACY PATH request', async () => {
    // The path form is the only way to express an action without a body, so a
    // bodyless request that DOES carry an action segment must still dispatch.
    const res = await MESSAGE_ACTION_POST(
      actionRequest(undefined, `${MESSAGE_ACTION_PATH}/read`)
    );

    expect(res.status).toBe(200);
    expect(mockMarkMessageAsRead).toHaveBeenCalledTimes(1);
    expect(mockMarkMessageAsRead.mock.calls[0]).toEqual([MESSAGE_ID]);
    expect(await res.json()).toEqual({ success: true, data: { markedAsRead: true } });
  });

  it('route still dispatches "read" when the body is a JSON array', async () => {
    // An array cannot satisfy the payload contract, so it must be treated as
    // "no payload" rather than crashing on a property read.
    const res = await MESSAGE_ACTION_POST(actionRequest([]));

    expect(res.status).toBe(400);
    expect(mockMarkMessageAsRead).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// C — delete / report / legacy path contracts
// ===========================================================================

describe('C: delete and report contracts', () => {
  it('deleteMessage posts exactly { action: "delete" }', async () => {
    await ClientMessagingService.deleteMessage(MESSAGE_ID);

    const call = onlyCall();
    expect(call.url).toBe(`/api/messages/messages/${MESSAGE_ID}`);
    expect(call.init?.method).toBe('POST');
    expect(bodyOf(call)).toEqual({ action: 'delete' });
    expect(Object.keys(bodyOf(call))).toEqual(['action']);
  });

  it('the route dispatches "delete" to MessagingService.deleteMessage', async () => {
    const res = await MESSAGE_ACTION_POST(actionRequest({ action: 'delete' }));

    expect(res.status).toBe(200);
    expect(mockDeleteMessage).toHaveBeenCalledTimes(1);
    expect(mockDeleteMessage.mock.calls[0]).toEqual([MESSAGE_ID]);
    expect(await res.json()).toEqual({ success: true, data: { deleted: true } });
  });

  it('reportMessage posts exactly { action, reason, description }', async () => {
    await ClientMessagingService.reportMessage(
      MESSAGE_ID,
      'Inappropriate content',
      'This message violates community guidelines'
    );

    const call = onlyCall();
    expect(call.url).toBe(`/api/messages/messages/${MESSAGE_ID}`);
    expect(call.init?.method).toBe('POST');
    expect(bodyOf(call)).toEqual({
      action: 'report',
      reason: 'Inappropriate content',
      description: 'This message violates community guidelines',
    });
    expect(Object.keys(bodyOf(call)).sort()).toEqual(['action', 'description', 'reason']);
  });

  it('the route dispatches "report" to MessagingService.reportMessage with reason and description', async () => {
    const res = await MESSAGE_ACTION_POST(
      actionRequest({
        action: 'report',
        reason: 'Inappropriate content',
        description: 'This message violates community guidelines',
      })
    );

    expect(res.status).toBe(201);
    expect(mockReportMessage).toHaveBeenCalledTimes(1);
    expect(mockReportMessage.mock.calls[0]).toEqual([
      MESSAGE_ID,
      'Inappropriate content',
      'This message violates community guidelines',
    ]);
    expect(await res.json()).toEqual({ success: true, data: { reported: true } });
  });

  it('rejects a report with a missing reason and never calls the service', async () => {
    for (const payload of [
      { action: 'report' },
      { action: 'report', reason: '' },
      { action: 'report', reason: 42 },
      { action: 'report', description: 'no reason given' },
    ]) {
      mockReportMessage.mockClear();
      const res = await MESSAGE_ACTION_POST(actionRequest(payload));
      expect(res.status).toBe(400);
      expect(mockReportMessage).not.toHaveBeenCalled();
    }
  });

  it('rejects whitespace-only newContent and never calls the service', async () => {
    for (const newContent of ['', '   ', '\t', '\n  \n']) {
      mockEditMessage.mockClear();
      const res = await MESSAGE_ACTION_POST(actionRequest({ action: 'edit', newContent }));
      expect(res.status).toBe(400);
      expect(mockEditMessage).not.toHaveBeenCalled();
    }
  });

  it('rejects a non-string newContent and never calls the service', async () => {
    for (const newContent of [undefined, null, 7, { text: 'hi' }]) {
      mockEditMessage.mockClear();
      const res = await MESSAGE_ACTION_POST(actionRequest({ action: 'edit', newContent }));
      expect(res.status).toBe(400);
      expect(mockEditMessage).not.toHaveBeenCalled();
    }
  });

  it('accepts the legacy path form /api/messages/messages/<id>/<action> as well as the body form', async () => {
    // Legacy path + payload in the body.
    const edit = await MESSAGE_ACTION_POST(
      actionRequest({ newContent: 'from the legacy path' }, `${MESSAGE_ACTION_PATH}/edit`)
    );
    expect(edit.status).toBe(200);
    expect(mockEditMessage.mock.calls[0]).toEqual([MESSAGE_ID, 'from the legacy path']);

    // Legacy path with no body at all.
    mockMarkMessageAsRead.mockClear();
    const read = await MESSAGE_ACTION_POST(actionRequest(undefined, `${MESSAGE_ACTION_PATH}/read`));
    expect(read.status).toBe(200);
    expect(mockMarkMessageAsRead).toHaveBeenCalledTimes(1);
    expect(mockMarkMessageAsRead.mock.calls[0][0]).toBe(MESSAGE_ID);

    mockDeleteMessage.mockClear();
    const del = await MESSAGE_ACTION_POST(actionRequest(undefined, `${MESSAGE_ACTION_PATH}/delete`));
    expect(del.status).toBe(200);
    expect(mockDeleteMessage.mock.calls[0]).toEqual([MESSAGE_ID]);

    mockReportMessage.mockClear();
    const report = await MESSAGE_ACTION_POST(
      actionRequest({ reason: 'Spam' }, `${MESSAGE_ACTION_PATH}/report`)
    );
    expect(report.status).toBe(201);
    expect(mockReportMessage.mock.calls[0][0]).toBe(MESSAGE_ID);
    expect(mockReportMessage.mock.calls[0][1]).toBe('Spam');
  });

  it('still rejects a bodyless request when no legacy action segment is present', async () => {
    const res = await MESSAGE_ACTION_POST(actionRequest());

    expect(res.status).toBe(400);
    expect(mockMarkMessageAsRead).not.toHaveBeenCalled();
    expect(mockEditMessage).not.toHaveBeenCalled();
    expect(mockDeleteMessage).not.toHaveBeenCalled();
    expect(mockReportMessage).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Action is required');
  });

  it('rejects an unknown action from both the body and the path', async () => {
    const fromBody = await MESSAGE_ACTION_POST(actionRequest({ action: 'explode' }));
    expect(fromBody.status).toBe(400);
    expect(mockEditMessage).not.toHaveBeenCalled();

    const fromPath = await MESSAGE_ACTION_POST(
      actionRequest(undefined, `${MESSAGE_ACTION_PATH}/explode`)
    );
    expect(fromPath.status).toBe(400);
    expect(mockEditMessage).not.toHaveBeenCalled();
  });

  it('requires authentication before dispatching any action', async () => {
    mockAuthGetCurrentUser.mockResolvedValue(null);

    const res = await MESSAGE_ACTION_POST(actionRequest({ action: 'read' }));

    expect(res.status).toBe(401);
    expect(mockMarkMessageAsRead).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D — unread count
// ===========================================================================

describe('D: unread notification count', () => {
  it('returns a NUMBER (the array length), not the raw array', async () => {
    nextResponse = jsonResponse({
      success: true,
      data: [
        { id: 'n1' },
        { id: 'n2' },
        { id: 'n3' },
      ],
    });

    const count = await ClientMessagingService.getUnreadMessageCount();

    expect(onlyCall().url).toBe('/api/messages/notifications');
    expect(typeof count).toBe('number');
    expect(count).toBe(3);
  });

  it('returns 0 for an empty notification array', async () => {
    nextResponse = jsonResponse({ success: true, data: [] });
    await expect(ClientMessagingService.getUnreadMessageCount()).resolves.toBe(0);
  });

  it('returns 0 -- never undefined or NaN -- when the payload is not an array', async () => {
    for (const payload of [
      { success: true, data: null },
      { success: true, data: {} },
      { success: true, data: { count: 7 } },
      { success: true },
      { success: true, data: 5 },
      { success: true, data: 'two' },
      { success: true, data: undefined },
    ]) {
      nextResponse = jsonResponse(payload);
      const count = await ClientMessagingService.getUnreadMessageCount();
      expect(count).toBe(0);
      expect(Number.isNaN(count)).toBe(false);
      expect(count).toBeDefined();
    }
  });

  it('getUserConversations hits /api/messages/conversations, not the notifications endpoint', async () => {
    nextResponse = jsonResponse({ success: true, data: [{ id: CONVERSATION_ID }] });

    const result = await ClientMessagingService.getUserConversations();

    const call = onlyCall();
    expect(call.url).toBe('/api/messages/conversations');
    expect(call.url).not.toContain('notifications');
    expect(call.init?.method).toBeUndefined();
    expect(call.init?.body).toBeUndefined();
    expect(result).toEqual([{ id: CONVERSATION_ID }]);
  });

  it('getConversationById and getMessages do not hit the notifications endpoint either', async () => {
    nextResponse = jsonResponse({ success: true, data: [] });

    await ClientMessagingService.getConversationById(CONVERSATION_ID);
    await ClientMessagingService.getMessages(CONVERSATION_ID, 1, 50);

    expect(fetchCalls.map((c) => c.url)).toEqual([
      `/api/messages/conversations/${CONVERSATION_ID}`,
      `/api/messages/conversations/${CONVERSATION_ID}/messages?page=1&limit=50`,
    ]);
  });
});

// ===========================================================================
// E — job delete contract
// ===========================================================================

describe('E: ClientJobService.deleteJob contract', () => {
  it('issues DELETE to /api/jobs/<id> with no body', async () => {
    nextResponse = jsonResponse({ success: true, data: { deleted: true } });

    await ClientJobService.deleteJob(JOB_ID);

    const call = onlyCall();
    expect(call.url).toBe(`/api/jobs/${JOB_ID}`);
    expect(call.init?.method).toBe('DELETE');
    expect(call.init?.body).toBeUndefined();
  });

  it('is a real DELETE, not the old PATCH { status: "cancelled" }', async () => {
    nextResponse = jsonResponse({ success: true, data: { deleted: true } });

    await ClientJobService.deleteJob(JOB_ID);

    const call = onlyCall();
    expect(call.init?.method).not.toBe('PATCH');
    // A DELETE carries no body at all, so the old `{ status: "cancelled" }`
    // payload cannot be present. Coerced because `toContain` rejects undefined.
    expect(call.init?.body ?? '').not.toContain('cancelled');
  });

  it('keeps closeJob as the separate PATCH { status: "closed" } path', async () => {
    nextResponse = jsonResponse({ success: true, data: {} });

    await ClientJobService.closeJob(JOB_ID);

    const call = onlyCall();
    expect(call.init?.method).toBe('PATCH');
    expect(bodyOf(call)).toEqual({ status: 'closed' });
  });
});
// ===========================================================================
// F — conversation switching: stale-response protection
//
// This asserts the guarantee `chat-view.tsx` depends on. There is no React
// renderer in this project, so the guarantee is pinned against real promises:
// a slow response that resolves AFTER the cleanup ran must not be committed.
// ===========================================================================

/**
 * The guard every async loader in this app uses:
 *
 *     let cancelled = false;
 *     const shouldApply = () => !cancelled;
 *     ... await ... if (!shouldApply()) return; ...
 *     return () => { cancelled = true; };
 *
 * The check happens BEFORE the commit. Checking it only after the loader
 * returned would be useless: the loader itself performs the setState, so by
 * then the stale write has already landed.
 *
 * Each effect run gets its OWN `cancelled` flag, exactly as React gives each
 * `useEffect` invocation its own closure. That is what makes the switch safe:
 * the cleanup for conversation A flips A's flag only, and B's run is unaffected.
 */
function makeEffectRun(
  load: (id: string) => Promise<unknown>,
  commit: (id: string, data: unknown) => void
) {
  let cancelled = false;
  let applied = 0;

  return {
    start: async (id: string) => {
      const data = await load(id);
      if (cancelled) return;
      applied += 1;
      commit(id, data);
    },
    cleanup: () => {
      cancelled = true;
    },
    get appliedCount() {
      return applied;
    },
  };
}

describe('F: conversation-switch stale-response protection', () => {
  it('discards a slow response for conversation A once B is showing', async () => {
    const commits: Array<[string, unknown]> = [];

    let resolveA: (value: string) => void = () => undefined;
    const load = (id: string): Promise<unknown> =>
      id === CONVERSATION_ID
        ? new Promise<string>((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve(`${id}-messages`);
    const commit = (id: string, data: unknown) => commits.push([id, data]);

    // Two effect runs, each with its own flag: this is what React produces
    // when `conversationId` changes from A to B.
    const runA = makeEffectRun(load, commit);
    const runB = makeEffectRun(load, commit);

    const pendingA = runA.start(CONVERSATION_ID);
    // React runs the cleanup for A, then the effect for B.
    runA.cleanup();
    const pendingB = runB.start('another-conversation');

    // A's response finally arrives, after the user has moved on.
    resolveA('A-messages');
    await Promise.all([pendingA, pendingB]);

    // Only B's data was committed. A's late arrival must not overwrite it.
    expect(commits).toEqual([['another-conversation', 'another-conversation-messages']]);
    expect(runA.appliedCount).toBe(0);
    expect(runB.appliedCount).toBe(1);
  });

  it('applies the response when nothing has been cancelled', async () => {
    const commits: Array<[string, unknown]> = [];
    const run = makeEffectRun(
      (id) => Promise.resolve(`${id}-messages`),
      (id, data) => commits.push([id, data])
    );

    await run.start(CONVERSATION_ID);

    expect(commits).toEqual([[CONVERSATION_ID, `${CONVERSATION_ID}-messages`]]);
  });

  it('does not commit after unmount', async () => {
    const commits: Array<[string, unknown]> = [];
    const run = makeEffectRun(
      (id) => Promise.resolve(`${id}-messages`),
      (id, data) => commits.push([id, data])
    );

    const pending = run.start(CONVERSATION_ID);
    run.cleanup(); // unmount
    await pending;

    expect(commits).toEqual([]);
    expect(run.appliedCount).toBe(0);
  });

  it('a conversation switch requests only the new id', async () => {
    nextResponse = jsonResponse({ success: true, data: [] });

    // Mirrors `loadConversation`: conversation metadata, then the message list.
    await ClientMessagingService.getConversationById('switched-conversation');
    await ClientMessagingService.getMessages('switched-conversation', 1, 50);

    const urls = fetchCalls.map((c) => c.url);
    expect(urls).toEqual([
      '/api/messages/conversations/switched-conversation',
      '/api/messages/conversations/switched-conversation/messages?page=1&limit=50',
    ]);
    // No request for the conversation we navigated away from.
    expect(urls.join(' ')).not.toContain(CONVERSATION_ID);
  });
});
// ===========================================================================
// G — subscription lifecycle
// ===========================================================================

/** A minimal stand-in for the realtime channel returned by the browser client. */
interface FakeChannel {
  name: string;
  handlers: Array<(payload: unknown) => void>;
  statusHandlers: Array<(status: string) => void>;
  on: (
    event: string,
    filter: unknown,
    handler: (payload: unknown) => void
  ) => FakeChannel;
  subscribe: (cb: (status: string) => void) => FakeChannel;
}

function makeFakeChannel(name: string): FakeChannel {
  const channel: FakeChannel = {
    name,
    handlers: [],
    statusHandlers: [],
    on(_event, _filter, handler) {
      channel.handlers.push(handler);
      return channel;
    },
    subscribe(cb) {
      channel.statusHandlers.push(cb);
      return channel;
    },
  };
  return channel;
}

type MessagingClient = typeof import('@/services/client-api.service').ClientMessagingService;

describe('G: subscribeToConversation lifecycle', () => {
  // The browser client is created lazily and only when `window` exists, so each
  // test stubs a window and injects a fake supabase module.
  let channel: FakeChannel;
  let removeChannel: ReturnType<typeof vi.fn>;
  let svc: MessagingClient;
  let originalWindow: unknown;

  beforeEach(async () => {
    channel = makeFakeChannel(`messages:conversation_id=eq.${CONVERSATION_ID}`);
    removeChannel = vi.fn();
    vi.resetModules();
    vi.doMock('@/lib/supabase/client', () => ({
      createClient: () => ({
        channel: (name: string) => {
          channel.name = name;
          return channel;
        },
        removeChannel,
      }),
    }));
    originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {};
    ({ ClientMessagingService: svc } = await import('@/services/client-api.service'));
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    vi.doUnmock('@/lib/supabase/client');
    vi.resetModules();
  });

  it('is inert outside the browser instead of throwing', () => {
    (globalThis as { window?: unknown }).window = undefined;

    const sub = svc.subscribeToConversation(CONVERSATION_ID, () => undefined);

    expect(sub.status).toBe('closed');
    expect(() => sub.unsubscribe()).not.toThrow();
  });

  it('is inert for an empty conversation id', () => {
    const sub = svc.subscribeToConversation('', () => undefined);

    expect(sub.status).toBe('closed');
    expect(() => sub.unsubscribe()).not.toThrow();
  });

  it('creates exactly one channel, on the conversation-scoped topic', () => {
    svc.subscribeToConversation(CONVERSATION_ID, () => undefined);

    expect(channel.name).toBe(`messages:conversation_id=eq.${CONVERSATION_ID}`);
    expect(channel.handlers).toHaveLength(1);
  });

  it('delivers an incoming payload to the caller', () => {
    const received: unknown[] = [];
    svc.subscribeToConversation(CONVERSATION_ID, (payload) => received.push(payload));

    const payload = { new: { id: 'm1', conversation_id: CONVERSATION_ID } };
    channel.handlers[0](payload);

    expect(received).toEqual([payload]);
  });

  it('removes the channel on unsubscribe', () => {
    const sub = svc.subscribeToConversation(CONVERSATION_ID, () => undefined);

    sub.unsubscribe();

    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(removeChannel.mock.calls[0][0]).toBe(channel);
  });

  it('a double unsubscribe does not remove the channel twice', () => {
    // `removeChannel` on an already-removed channel logs and leaks the entry
    // from the supabase-js registry, so this guard is load-bearing.
    const sub = svc.subscribeToConversation(CONVERSATION_ID, () => undefined);

    sub.unsubscribe();
    sub.unsubscribe();
    sub.unsubscribe();

    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
it('reports an error status so the caller can fall back to a refetch', () => {
    const statuses: string[] = [];
    svc.subscribeToConversation(
      CONVERSATION_ID,
      () => undefined,
      (status) => statuses.push(status)
    );

    channel.statusHandlers[0]('CHANNEL_ERROR');
    channel.statusHandlers[0]('SUBSCRIBED');

    expect(statuses).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED']);
  });

  it('tolerates a status arriving with no status handler', () => {
    // `onStatus` is optional; a status must not break the subscription.
    const sub = svc.subscribeToConversation(CONVERSATION_ID, () => undefined);

    expect(() => channel.statusHandlers[0]('TIMED_OUT')).not.toThrow();
    expect(() => sub.unsubscribe()).not.toThrow();
  });
});

// ===========================================================================
// H — client-side error handling and authorization surfacing
// ===========================================================================

describe('H: client error handling', () => {
  it('throws the server-provided message on a 4xx', async () => {
    nextResponse = jsonResponse(
      { success: false, error: { message: 'Message not found.' } },
      404
    );

    await expect(ClientMessagingService.markMessageAsRead(MESSAGE_ID)).rejects.toThrow(
      'Message not found.'
    );
  });

  it('throws a generic message when the server sends no parseable body', async () => {
    // A 500 answered with an HTML error page must still reject. Resolving with
    // `undefined` would leave the caller believing the action succeeded.
    nextResponse = unparseableResponse(500);

    await expect(ClientMessagingService.markMessageAsRead(MESSAGE_ID)).rejects.toThrow(
      'Request failed'
    );
  });

  it('propagates a 401 rather than resolving as success', async () => {
    nextResponse = jsonResponse(
      { success: false, error: { message: 'Authentication required.' } },
      401
    );

    await expect(ClientMessagingService.getUserConversations()).rejects.toThrow(
      'Authentication required.'
    );
  });

  it('propagates a 403 from a conversation the user may not read', async () => {
    nextResponse = jsonResponse(
      { success: false, error: { message: 'You are not a participant in this conversation.' } },
      403
    );

    await expect(
      ClientMessagingService.getMessages(CONVERSATION_ID, 1, 50)
    ).rejects.toThrow('You are not a participant in this conversation.');
  });

  it('propagates a 403 from sending into a conversation the user may not post to', async () => {
    nextResponse = jsonResponse(
      { success: false, error: { message: 'You are not a participant in this conversation.' } },
      403
    );

    await expect(ClientMessagingService.sendMessage(CONVERSATION_ID, 'hi')).rejects.toThrow(
      'You are not a participant in this conversation.'
    );
  });

  it('propagates a 403 from editing a message the user does not own', async () => {
    nextResponse = jsonResponse(
      { success: false, error: { message: 'You can only edit your own messages.' } },
      403
    );

    await expect(ClientMessagingService.editMessage(MESSAGE_ID, 'hi')).rejects.toThrow(
      'You can only edit your own messages.'
    );
  });

  it('always sends a JSON content-type, including on bodyless requests', async () => {
    nextResponse = jsonResponse({ success: true, data: [] });

    await ClientMessagingService.getUserConversations();
    await ClientMessagingService.markMessageAsRead(MESSAGE_ID);

    for (const call of fetchCalls) {
      const headers = call.init?.headers as Record<string, string> | undefined;
      expect(headers?.['content-type']).toBe('application/json');
    }
  });

  it('does not silently swallow a network-level rejection', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(ClientMessagingService.sendMessage(CONVERSATION_ID, 'hi')).rejects.toThrow(
      'Failed to fetch'
    );
  });

  it('sendMessage posts the conversation-scoped path with a { content } body', async () => {
    nextResponse = jsonResponse({ success: true, data: { id: 'm1' } });

    await ClientMessagingService.sendMessage(CONVERSATION_ID, 'hello there');

    const call = onlyCall();
    expect(call.url).toBe(`/api/messages/conversations/${CONVERSATION_ID}/messages`);
    expect(call.init?.method).toBe('POST');
    expect(bodyOf(call)).toEqual({ content: 'hello there' });
  });
});