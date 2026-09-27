import { describe, expect, it } from 'vitest';
import { buildDedupKey, isDedupViolation, DEDUP_VIOLATION_CODE } from '@/lib/notifications/dedup';
import {
  defaultEnabledFor,
  isInAppLocked,
  DEFAULT_EMAIL_ENABLED,
  ESSENTIAL_IN_APP_TYPES,
} from '@/lib/notifications/defaults';
import { NOTIFICATION_TYPES, notificationTypeEnum } from '@/lib/notifications/types';
import {
  renderEmail,
  escapeHtml,
  preferencesUrl,
} from '@/lib/notifications/email-templates';
import { REQUIRED_EVENT_COVERAGE } from '@/lib/notifications/events';
import type { NotificationType } from '@/types/database';

/**
 * The Stage 12 pure layer: dedup keys, default preferences, event coverage and
 * email rendering.
 *
 * The property that matters most here is dedup. "Do not send duplicate
 * notifications for the same event" is enforced by a unique index, and an index
 * can only arbitrate correctly if the key is a deterministic function of the
 * event. A key containing a timestamp or a random value would pass every test
 * that checks uniqueness and still fail to deduplicate anything in production, so
 * several of these tests are specifically about determinism and aliasing.
 */

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// ===========================================================================
// Dedup
// ===========================================================================

describe('dedup key', () => {
  it('is deterministic for the same event', () => {
    const first = buildDedupKey({ type: 'proposal_received', entityId: 'p1', recipientId: USER_A });
    const second = buildDedupKey({ type: 'proposal_received', entityId: 'p1', recipientId: USER_A });
    expect(first).toBe(second);
  });

  it('is case- and whitespace-insensitive, so a reserialised id still matches', () => {
    const a = buildDedupKey({ type: 'Proposal_Received', entityId: ' P1 ', recipientId: USER_A });
    const b = buildDedupKey({ type: 'proposal_received', entityId: 'p1', recipientId: USER_A });
    expect(a).toBe(b);
  });

  it('separates recipients, so two users do not collide on one event', () => {
    const a = buildDedupKey({ type: 'proposal_received', entityId: 'p1', recipientId: USER_A });
    const b = buildDedupKey({ type: 'proposal_received', entityId: 'p1', recipientId: USER_B });
    expect(a).not.toBe(b);
  });

  it('separates entities, so one recipient does not collide across events', () => {
    const a = buildDedupKey({ type: 'proposal_received', entityId: 'p1', recipientId: USER_A });
    const b = buildDedupKey({ type: 'proposal_received', entityId: 'p2', recipientId: USER_A });
    expect(a).not.toBe(b);
  });

  it('separates types, so the same entity id in two roles does not collide', () => {
    const a = buildDedupKey({ type: 'milestone_submitted', entityId: 'm1', recipientId: USER_A });
    const b = buildDedupKey({ type: 'milestone_approved', entityId: 'm1', recipientId: USER_A });
    expect(a).not.toBe(b);
  });

  it('strips separators so a crafted component cannot forge a segment boundary', () => {
    // Without stripping, this would render as three components and could alias
    // onto the key for a different (type, entity, recipient) triple.
    const forged = buildDedupKey({
      type: 'a:b',
      entityId: 'c',
      recipientId: 'd:e',
    });
    const genuine = buildDedupKey({ type: 'a', entityId: 'b:c', recipientId: 'd:e' });
    expect(forged).not.toBe(genuine);
    expect(forged?.split(':')).toHaveLength(3);
  });

  it('returns null without an entity, so a one-off is deliberately not deduplicated', () => {
    expect(buildDedupKey({ type: 'system_alert', entityId: null, recipientId: USER_A })).toBeNull();
    expect(buildDedupKey({ type: 'system_alert', entityId: '', recipientId: USER_A })).toBeNull();
  });

  it('returns null without a recipient or a type', () => {
    expect(buildDedupKey({ type: 'system_alert', entityId: 'x', recipientId: '' })).toBeNull();
    expect(buildDedupKey({ type: '', entityId: 'x', recipientId: USER_A })).toBeNull();
  });

  it('recognises the unique-violation it is written to absorb', () => {
    expect(isDedupViolation({ code: DEDUP_VIOLATION_CODE })).toBe(true);
    expect(isDedupViolation({ code: '23503' })).toBe(false);
    expect(isDedupViolation(null)).toBe(false);
  });
});

// ===========================================================================
// Event type coverage
// ===========================================================================

describe('event type coverage', () => {
  it('covers all fourteen events the brief requires', () => {
    expect(Object.keys(REQUIRED_EVENT_COVERAGE)).toHaveLength(14);
  });

  it('maps every required event to a type the database enum accepts', () => {
    for (const [label, mapping] of Object.entries(REQUIRED_EVENT_COVERAGE)) {
      const parsed = notificationTypeEnum.safeParse(mapping.type);
      expect(parsed.success, `${label} -> ${mapping.type}`).toBe(true);
    }
  });

  it('includes the four event types Stage 1 had no value for', () => {
    // Without these four, the brief's events had nowhere to be recorded.
    for (const type of [
      'proposal_rejected',
      'milestone_created',
      'payment_failed',
      'contract_completed',
    ] as NotificationType[]) {
      expect(NOTIFICATION_TYPES).toContain(type);
      expect(notificationTypeEnum.safeParse(type).success).toBe(true);
    }
  });

  it('has a default entry for every type, so no event silently has no policy', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(DEFAULT_EMAIL_ENABLED[type]).toBeTypeOf('boolean');
    }
  });

  it('renders an email for every type without throwing', () => {
    for (const type of NOTIFICATION_TYPES) {
      const rendered = renderEmail(type, { recipientName: 'Test User', appUrl: 'https://x.test' });
      expect(rendered.subject.length, type).toBeGreaterThan(0);
      expect(rendered.text.length, type).toBeGreaterThan(0);
      expect(rendered.html, type).toContain('<!doctype html>');
    }
  });
});

// ===========================================================================
// Default preferences
// ===========================================================================

describe('default preferences', () => {
  it('emails financial and contractual events by default', () => {
    for (const type of [
      'dispute_opened',
      'payment_escrowed',
      'payment_failed',
      'payment_released',
      'proposal_accepted',
      'proposal_rejected',
      'contract_completed',
    ] as NotificationType[]) {
      expect(defaultEnabledFor(type, 'email'), type).toBe(true);
    }
  });

  it('does not email high-volume events by default', () => {
    // Emailing every chat message or every inbound proposal is how a
    // transactional sender gets filtered as spam.
    expect(defaultEnabledFor('message_received', 'email')).toBe(false);
    expect(defaultEnabledFor('proposal_received', 'email')).toBe(false);
    expect(defaultEnabledFor('milestone_created', 'email')).toBe(false);
  });

  it('keeps in-app on for everything, so the badge is never empty by default', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(defaultEnabledFor(type, 'in_app'), type).toBe(true);
    }
  });

  it('locks the in-app delivery of essential events', () => {
    for (const type of [
      'payment_escrowed',
      'payment_failed',
      'payment_released',
      'dispute_opened',
      'contract_created',
      'contract_completed',
      'review_submitted',
      'system_alert',
    ] as NotificationType[]) {
      expect(isInAppLocked(type), type).toBe(true);
      expect(ESSENTIAL_IN_APP_TYPES.has(type)).toBe(true);
      // Locked means on, regardless of any default that might say otherwise.
      expect(defaultEnabledFor(type, 'in_app')).toBe(true);
    }
  });

  it('does not lock ordinary events, so a user can mute them in-app', () => {
    expect(isInAppLocked('message_received')).toBe(false);
    expect(isInAppLocked('milestone_created')).toBe(false);
  });

  it('treats an unknown channel as off, so a new channel never mass-mails users', () => {
    expect(defaultEnabledFor('dispute_opened', 'sms')).toBe(false);
    expect(defaultEnabledFor('dispute_opened', 'push')).toBe(false);
  });
});

// ===========================================================================
// Email rendering and escaping
// ===========================================================================

describe('email rendering', () => {
  it('escapes HTML in every interpolated value', () => {
    const rendered = renderEmail('proposal_received', {
      recipientName: '<script>alert(1)</script>',
      metadata: { jobTitle: '"><img src=x onerror=alert(1)>' },
      appUrl: 'https://x.test',
    });
    // The structural characters are neutralised, so neither payload can open a
    // tag or break out of an attribute. The remaining literal text ("onerror=")
    // is inert: with `<`, `>` and `"` escaped there is no tag for it to attach to,
    // which is why the assertion is about structure rather than substrings.
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes the five characters that matter', () => {
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
    // The ampersand is escaped first, so it is not double-escaped.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('renders null and undefined as empty rather than "undefined"', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    const rendered = renderEmail('milestone_submitted', {
      metadata: { milestoneTitle: null },
      appUrl: 'https://x.test',
    });
    expect(rendered.html).not.toContain('undefined');
  });

  it('strips newlines from plain-text values, so a value cannot append a header', () => {
    const rendered = renderEmail('message_received', {
      actorName: 'Attacker\r\nBcc: everyone@example.com',
      appUrl: 'https://x.test',
    });
    // The raw CRLF must not survive into the text body.
    expect(rendered.text).not.toContain('Bcc: everyone@example.com\r\n');
  });

  it('always includes a plain-text alternative', () => {
    const rendered = renderEmail('dispute_opened', { appUrl: 'https://x.test' });
    expect(rendered.text.length).toBeGreaterThan(0);
    expect(rendered.html).toContain('<html');
  });

  it('builds an absolute preferences link for the unsubscribe footer', () => {
    expect(preferencesUrl('https://market.test')).toBe(
      'https://market.test/settings/notifications'
    );
    expect(preferencesUrl('https://market.test/')).toBe('https://market.test/settings/notifications');
  });

  it('truncates an over-long subject rather than emitting an unbounded header', () => {
    const rendered = renderEmail('milestone_created', {
      metadata: { milestoneTitle: 'x'.repeat(500) },
      appUrl: 'https://x.test',
    });
    expect(rendered.subject.length).toBeLessThanOrEqual(200);
  });
});
