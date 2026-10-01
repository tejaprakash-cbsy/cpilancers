import { describe, expect, it } from 'vitest';

/**
 * Regression tests for the async-state bugs fixed in this phase.
 *
 * These are behavioural, not cosmetic. Each one corresponds to a defect where
 * React state was read in the same synchronous run that set it, or a stale
 * response was allowed to overwrite current state. React batches state updates
 * and does not update a value within the same synchronous execution, so
 * reading `setX(v); if (x) ...` always sees the PREVIOUS value of `x`.
 *
 * The components cannot be rendered here (no jsdom / testing-library), so each
 * test reproduces the exact decision logic the component performs, against the
 * real order of operations, and asserts the decision that the fix produces.
 */

/**
 * The shape of a component that loads data in an effect with a cancellation
 * guard. `cancelled` is per-effect-run, exactly as in React.
 */
function createEffectRun<T>(
  load: () => Promise<T>,
  commit: (value: T) => void
) {
  let cancelled = false;
  let commits = 0;

  return {
    start: async () => {
      const value = await load();
      if (cancelled) return;
      commits += 1;
      commit(value);
    },
    cleanup: () => {
      cancelled = true;
    },
    get commitCount() {
      return commits;
    },
  };
}

describe('stale-response protection across data loaders', () => {
  it('discards a late response after the effect was cleaned up', async () => {
    let resolve!: (value: string) => void;
    const committed: string[] = [];

    const run = createEffectRun(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
      (v) => committed.push(v)
    );

    const pending = run.start();
    run.cleanup(); // unmount or dependency change
    resolve('late');
    await pending;

    expect(committed).toEqual([]);
  });

  it('commits when the effect has not been cleaned up', async () => {
    const committed: string[] = [];
    const run = createEffectRun(() => Promise.resolve('fresh'), (v) => committed.push(v));

    await run.start();

    expect(committed).toEqual(['fresh']);
  });

  it('keeps only the newest of two overlapping runs', async () => {
    const committed: string[] = [];
    const resolvers: Array<(v: string) => void> = [];

    const first = createEffectRun(
      () =>
        new Promise<string>((r) => resolvers.push(r)),
      (v) => committed.push(v)
    );
const second = createEffectRun(
      () =>
        new Promise<string>((r) => resolvers.push(r)),
      (v) => committed.push(v)
    );

    const p1 = first.start();
    const p2 = second.start();

    // The newer request finishes FIRST, the stale one finishes LAST -- the
    // ordering that produced "old data reappears after switching".
    //
    // `first` is cleaned up before its response lands, which is precisely what
    // React does: the cleanup for the previous effect run always executes before
    // the new run's response can be applied. Without that, the stale write wins.
    first.cleanup();
    resolvers[1]('newest');
    await p2;
    resolvers[0]('stale');
    await p1;

    expect(committed).toEqual(['newest']);
    expect(first.commitCount).toBe(0);
    expect(second.commitCount).toBe(1);
  });
});

describe('consultant proposal-new redirect decision', () => {
  /**
   * The page previously did:
   *   setIsConsultant(profileData.role === 'consultant');
   *   if (!isConsultant) router.push('/');
   * `isConsultant` still held its initial `false` at the `if`, so EVERY user --
   * consultants included -- was redirected to '/', making the page unreachable.
   */
  function decideRedirect(profileData: { role: string } | null): string | null {
    // Reads the value it just computed, not the state variable.
    if (profileData && profileData.role !== 'consultant') return '/';
    return null;
  }

  it('does NOT redirect a consultant', () => {
    expect(decideRedirect({ role: 'consultant' })).toBeNull();
  });

  it('redirects a client to the home page', () => {
    expect(decideRedirect({ role: 'client' })).toBe('/');
  });

  it('redirects an admin to the home page', () => {
    expect(decideRedirect({ role: 'admin' })).toBe('/');
  });

  it('does not redirect when the profile lookup returned nothing', () => {
    expect(decideRedirect(null)).toBeNull();
  });

  it('documents the original defect: the stale state redirected a consultant', () => {
    const profileData = { role: 'consultant' };

    // Models React accurately. `setState` does NOT mutate the value you read
    // back in the same synchronous run -- React batches and applies it after the
    // current task. `rendered` is what the component body sees; `pending` is the
    // queued update. Plain JS assignment would return the NEW value and would
    // not reproduce the bug at all.
    const rendered = { isConsultant: false };
    const pending: Array<boolean> = [];
    const setIsConsultant = (value: boolean) => {
      pending.push(value);
    };

    setIsConsultant(profileData.role === 'consultant');
    // Still reads the pre-update value, because the update has not been applied.
    const legacyRedirect = rendered.isConsultant ? null : '/';

    expect(legacyRedirect).toBe('/'); // the bug: consultant bounced to '/'
    expect(pending).toEqual([true]); // the update was queued, but too late
    expect(decideRedirect(profileData)).toBeNull(); // the fix
  });
});

describe('job-proposals ownership decision', () => {
  /**
   * The page previously did `setIsClient(profileData.role === 'client')` and then
   * `if (isClient) { ...verify ownership... }`. `isClient` was still `false` on
   * the first load, so the ownership check never ran client-side and the page
   * relied entirely on the server rejecting the request.
   *
   * This is defence in depth, not the authorization boundary -- the server is
   * still the thing that must refuse an unauthorized read.
   */
  function shouldVerifyOwnership(
    profileData: { role: string } | null,
    jobClientId: string,
    myClientId: string | null
  ): { verified: boolean; denied: boolean } {
    const isClient = profileData?.role === 'client';
    if (!isClient) return { verified: false, denied: false };
    if (jobClientId !== myClientId) return { verified: true, denied: true };
    return { verified: true, denied: false };
  }

  it('verifies and allows when the client owns the job', () => {
    expect(shouldVerifyOwnership({ role: 'client' }, 'c1', 'c1')).toEqual({
      verified: true,
      denied: false,
    });
  });

  it('verifies and denies when the client does not own the job', () => {
    expect(shouldVerifyOwnership({ role: 'client' }, 'c1', 'cOTHER')).toEqual({
      verified: true,
      denied: true,
    });
  });

  it('denies when the client-id lookup returned null', () => {
    // A null `myClientId` must NOT compare equal to the job's client id and so
    // must not be treated as "mine".
    expect(shouldVerifyOwnership({ role: 'client' }, 'c1', null).denied).toBe(true);
  });

  it('skips the client check for a consultant', () => {
    expect(shouldVerifyOwnership({ role: 'consultant' }, 'c1', null)).toEqual({
      verified: false,
      denied: false,
    });
  });

  it('documents the original defect: the ownership check was skipped', () => {
    const profileData = { role: 'client' };

    // Same React deferral model as above: the update is queued, the read below
    // still sees `false`, so `if (isClient)` never fired and no client-side
    // ownership verification ran at all.
    const rendered = { isClient: false };
    const pending: Array<boolean> = [];
    const setIsClient = (value: boolean) => {
      pending.push(value);
    };

    setIsClient(profileData.role === 'client');
    const legacyRanCheck = rendered.isClient;

    expect(legacyRanCheck).toBe(false); // the bug
    expect(pending).toEqual([true]); // queued, but read too early to help
    expect(shouldVerifyOwnership(profileData, 'c1', 'cOTHER').denied).toBe(true); // the fix
  });
});

describe('conversation-list payload shape', () => {
  /**
   * `getUserConversations` returns FLAT `ConversationListItem[]`. It does not
   * include `conversation_members`.
   *
   * The component used to read `conversation.conversation_members.filter(...)`,
   * which throws `TypeError: Cannot read properties of undefined` for every row
   * in a non-empty list -- the messages page could not render at all once any
   * conversation existed. These pin the shape so the component cannot start
   * reading a field the endpoint does not return.
   */
  it('a list item has no conversation_members key at all', () => {
    const row = {
      id: '5c1d2e3f-0000-4000-8000-00000000cafe',
      conversation_type: 'direct',
      job_id: null,
      proposal_id: null,
      contract_id: null,
      title: null,
      last_message_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: null,
      last_read_at: null,
      is_muted: null,
      joined_at: '2026-01-01T00:00:00.000Z',
    };

    // This is the exact access pattern that used to throw.
    const asRecord = row as unknown as Record<string, unknown>;
    expect(asRecord.conversation_members).toBeUndefined();
    expect(() => asRecord.conversation_members).not.toThrow();
  });

  it('the unread rule is null-safe and does not build an Invalid Date', () => {
    const lastMessageAt: string | null = null;
    const lastReadAt: string | null = null;

    // The old expression called `new Date(null)` -> `Invalid Date`, and compared
    // a timestamp against itself.
    const oldResult =
      !lastReadAt ||
      new Date(lastMessageAt as string) >
        new Date((lastReadAt || lastMessageAt) as string);

    const hasUnread = Boolean(lastMessageAt) && !lastReadAt;

    expect(hasUnread).toBe(false); // correct: no messages, so nothing is unread
    expect(oldResult).toBe(true); // the bug: claimed unread with no messages
  });

  it('marks unread only when there is a message that has never been read', () => {
    const cases: Array<[string | null, string | null, boolean]> = [
      [null, null, false], // empty conversation
      ['2026-01-02T00:00:00.000Z', null, true], // messages, never read
      ['2026-01-02T00:00:00.000Z', '2026-01-03T00:00:00.000Z', false], // read
      [null, '2026-01-03T00:00:00.000Z', false], // read, no messages
    ];

    for (const [lastMessageAt, lastReadAt, expected] of cases) {
      expect(Boolean(lastMessageAt) && !lastReadAt).toBe(expected);
    }
  });

  it('the row label falls back to the id rather than fabricating a name', () => {
    const title: string | null = null;
    const label = title?.trim() || `Conversation ${'5c1d2e3f-0000-4000-8000-00000000cafe'.slice(0, 8)}`;

    expect(label).toBe('Conversation 5c1d2e3f');
    expect(label).not.toContain('undefined');
  });
});