import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stage 12 remediation tests, part 2: the SendGrid channel and the business-path
 * wiring of the four previously-unwired events.
 *
 * The ASM tests exist because the previous implementation hardcoded
 * `asm: { groupId: 1 }`. SendGrid suppression group ids are account-specific, so
 * a group that does not exist on the account makes SendGrid reject the entire
 * send with a 400 — meaning transactional email failed for everyone until the
 * value was changed in source.
 */

const { mockSend, mockSetApiKey, envHolder } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockSetApiKey: vi.fn(),
  envHolder: { current: {} as Record<string, unknown> },
}));

vi.mock('@sendgrid/mail', () => ({
  default: { send: mockSend, setApiKey: mockSetApiKey },
}));

vi.mock('@/config/env', () => ({
  env: new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) => envHolder.current[prop],
  }),
}));

import { emailChannel } from '@/lib/notifications/channels/email';

const context = {
  notificationId: '11111111-1111-4111-8111-111111111111',
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'payment_escrowed' as const,
  title: 'Payment received',
  body: 'Held in escrow.',
  actionUrl: '/payments/1',
  entityType: 'payment',
  entityId: '22222222-2222-4222-8222-222222222222',
  metadata: { amountFormatted: 'INR 1000.00' },
  email: 'user@example.com',
  displayName: 'Test User',
};

function sentMessage() {
  return mockSend.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  envHolder.current = {
    SENDGRID_API_KEY: 'SG.test-key',
    EMAIL_FROM: 'noreply@example.com',
    NEXT_PUBLIC_APP_NAME: 'Marketplace',
    NEXT_PUBLIC_APP_URL: 'https://market.test',
  };
  // The SDK resolves a tuple; the channel reads element zero.
  mockSend.mockResolvedValue([{ statusCode: 202, body: '', headers: {} }, {}]);
});

// ===========================================================================
// TEST 6 — ASM configuration
// ===========================================================================

describe('TEST 6: SendGrid ASM group is configuration, not a literal', () => {
  it('omits asm entirely when no group is configured', async () => {
    envHolder.current.SENDGRID_ASM_GROUP_ID = undefined;

    const outcome = await emailChannel.deliver(context);

    expect(outcome.status).toBe('sent');
    // The regression: a hardcoded group would have sent `asm: { groupId: 1 }`
    // and SendGrid would reject the whole send with a 400.
    expect(sentMessage().asm).toBeUndefined();
    expect('asm' in sentMessage()).toBe(false);
  });

  it('sends the configured group when one is set', async () => {
    envHolder.current.SENDGRID_ASM_GROUP_ID = 48213;

    const outcome = await emailChannel.deliver(context);

    expect(outcome.status).toBe('sent');
    // camelCase in the SDK; the snake_case form is the wire shape and does not
    // type-check against MailData.
    expect(sentMessage().asm).toEqual({ groupId: 48213, groupsToDisplay: [48213] });
  });

  it('never invents a group id when the variable is absent', async () => {
    envHolder.current.SENDGRID_ASM_GROUP_ID = undefined;
    await emailChannel.deliver(context);
    const message = sentMessage();
    const serialised = JSON.stringify(message);
    expect(serialised).not.toContain('"groupId":1');
    expect(serialised).not.toContain('"group_id"');
  });

  it('does not set bypassListManagement, so unsubscribes are still honoured', async () => {
    envHolder.current.SENDGRID_ASM_GROUP_ID = 7;
    await emailChannel.deliver(context);
    expect((sentMessage().mailSettings as Record<string, unknown> | undefined)?.bypassListManagement)
      .toBeUndefined();
  });

  it('reports skipped, not sent, when the channel is unconfigured', async () => {
    delete envHolder.current.SENDGRID_API_KEY;
    const outcome = await emailChannel.deliver(context);
    expect(outcome.status).toBe('skipped');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not report success when SendGrid rejects the send', async () => {
    mockSend.mockRejectedValue({
      code: 400,
      message: 'Bad Request',
      response: { body: { errors: [{ message: 'invalid request', field: 'asm.group_id' }] } },
    });

    const outcome = await emailChannel.deliver(context);

    // A 400 is not retryable, so no retry hint is attached and nothing claims
    // the mail went out.
    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.retryAfterSeconds).toBeUndefined();
    if (outcome.status === 'failed') {
      // The useful detail is in response.body.errors[], not error.message.
      expect(outcome.error).toContain('invalid request');
    }
  });

  it('attaches a retry hint for a rate limit', async () => {
    mockSend.mockRejectedValue({ code: 429, message: 'Too Many Requests', response: { body: {} } });
    const outcome = await emailChannel.deliver(context);
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') expect(outcome.retryAfterSeconds).toBe(60);
  });

  it('treats a non-2xx response as a failure rather than success', async () => {
    mockSend.mockResolvedValue([{ statusCode: 500, body: '', headers: {} }, {}]);
    const outcome = await emailChannel.deliver(context);
    expect(outcome.status).toBe('failed');
  });

  it('treats a network error with no response as a failure, not a crash', async () => {
    mockSend.mockRejectedValue(new Error('ECONNRESET'));
    const outcome = await emailChannel.deliver(context);
    expect(outcome.status).toBe('failed');
  });

  it('skips rather than fails when the recipient has no address', async () => {
    const outcome = await emailChannel.deliver({ ...context, email: null });
    expect(outcome.status).toBe('skipped');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('escapes user content in the rendered body', async () => {
    await emailChannel.deliver({
      ...context,
      type: 'proposal_received',
      metadata: { jobTitle: '<script>alert(1)</script>' },
    });
    expect(sentMessage().html).not.toContain('<script>');
  });

  it('never sends the API key to the provider payload', async () => {
    await emailChannel.deliver(context);
    expect(JSON.stringify(sentMessage())).not.toContain('SG.test-key');
  });
});

// ===========================================================================
// TEST 7 - customArgs carry the minimum provider-side correlation handle
// ===========================================================================

describe('TEST 7: customArgs are minimized to a correlation handle', () => {
  it('sends the notification id, which is what support traces a message by', async () => {
    await emailChannel.deliver(context);
    expect(sentMessage().customArgs).toEqual({
      notification_id: context.notificationId,
    });
  });

  it('does not send the recipient user id to a third party', async () => {
    await emailChannel.deliver(context);
    // The address already identifies the recipient; repeating their internal id
    // to an external provider adds exposure and buys nothing.
    const serialised = JSON.stringify(sentMessage().customArgs);
    expect(serialised).not.toContain(context.userId);
    expect(sentMessage().customArgs).not.toHaveProperty('user_id');
  });

  it('does not send internal entity identifiers', async () => {
    await emailChannel.deliver(context);
    const args = sentMessage().customArgs as Record<string, string>;
    // All derivable by joining on notification_id, and meaningless outside this
    // database.
    expect(args).not.toHaveProperty('entity_id');
    expect(args).not.toHaveProperty('entity_type');
    expect(args).not.toHaveProperty('notification_type');
  });

  it('never leaks contact details or message content into customArgs', async () => {
    await emailChannel.deliver(context);
    const args = JSON.stringify(sentMessage().customArgs);
    expect(args).not.toContain('user@example.com');
    expect(args).not.toContain('Test User');
    expect(args).not.toContain(context.body);
    expect(args).not.toContain('INR 1000.00');
  });

  it('keeps a single key even when every other field is present', async () => {
    // Guards the shape rather than the values: exactly one key, always.
    await emailChannel.deliver({
      ...context,
      entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc@2026-01-01',
      entityType: 'milestone',
    });
    expect(Object.keys(sentMessage().customArgs as object)).toEqual(['notification_id']);
  });

  it('is a stable idempotency handle for a provider-side redrive', async () => {
    // The guarantee documented on NotificationService.emit: a redrive can reuse
    // this value to recognise its own earlier send.
    await emailChannel.deliver(context);
    const args = sentMessage().customArgs as Record<string, string>;
    expect(args.notification_id).toBe(context.notificationId);
    await emailChannel.deliver(context);
    const second = mockSend.mock.calls[1][0] as Record<string, unknown>;
    expect((second.customArgs as Record<string, string>).notification_id).toBe(
      context.notificationId
    );
  });
});
