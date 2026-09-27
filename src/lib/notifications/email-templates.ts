/**
 * Transactional email templates.
 *
 * One template per notification type, producing a subject, a plain-text body and
 * an HTML body. Rendered in code rather than stored in the database so a copy
 * change is versioned with the code that renders it and needs no migration.
 *
 * SECURITY. Every interpolated value is escaped. Notification content is built
 * from database rows that other users wrote — a job title, a display name, a
 * review excerpt, a dispute reason — so an unescaped interpolation here would be
 * a stored-XSS and HTML-injection vector in the recipient's mail client, and a
 * vector for spoofing the platform's own voice in an email. `escapeHtml` is
 * applied to every dynamic value and there is deliberately no "trusted HTML" path.
 *
 * Every template also receives a plain-text alternative, because it is the part
 * that survives a client that renders nothing.
 */

import type { NotificationType } from './types';

export interface TemplateContext {
  /** The recipient's display name, if known. */
  recipientName?: string | null;
  /** The display name of whoever or whatever caused the event. */
  actorName?: string | null;
  /** Type-specific values. See the per-template documentation below. */
  metadata?: Record<string, string | number | null | undefined>;
  /** Absolute base URL, used to build the call-to-action link. */
  appUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/**
 * Escape a value for interpolation into HTML text or an attribute.
 *
 * `&` is replaced first so the ampersands introduced by the later replacements
 * are not double-escaped. Apostrophe and quote are included because values are
 * interpolated into a `title="..."` attribute as well as into text.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip characters that would let a value break out of a mail client context or
 * smuggle a header. Plain-text bodies only.
 */
function plain(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    // A bare CRLF or LF in a value would let a caller append extra headers.
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function m(ctx: TemplateContext, key: string): string {
  return plain(ctx.metadata?.[key]);
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

interface TemplateDefinition {
  subject: (ctx: TemplateContext) => string;
  /** One or two plain sentences, no greeting, no sign-off. */
  text: (ctx: TemplateContext) => string;
  /** HTML fragment for the message body. Escaped values only. */
  html: (ctx: TemplateContext) => string;
}

/**
 * Per-type templates.
 *
 * Metadata keys are documented inline. `NotificationService` passes whatever the
 * emitting code supplied; a missing key renders as an empty string rather than
 * printing `undefined`, because a template that says "undefined" in a financial
 * email is worse than one that says less.
 */
const TEMPLATES: Record<NotificationType, TemplateDefinition> = {
  proposal_received: {
    // metadata: { jobTitle }
    subject: (c) => `New proposal on ${m(c, 'jobTitle') || 'a job you posted'}`,
    text: (c) =>
      `${plain(c.actorName) || 'A consultant'} submitted a proposal on ${m(c, 'jobTitle') || 'your job'}.`,
    html: (c) => `<p><strong>${escapeHtml(plain(c.actorName) || 'A consultant')}</strong> submitted a proposal on <strong>${escapeHtml(m(c, 'jobTitle') || 'your job')}</strong>.</p>`,
  },

  proposal_shortlisted: {
    // metadata: { jobTitle }
    subject: () => `Your proposal was shortlisted`,
    text: (c) =>
      `Your proposal on ${m(c, 'jobTitle') || 'a job'} has been shortlisted. The client will be in touch if they would like to proceed.`,
    html: (c) => `<p>Your proposal on <strong>${escapeHtml(m(c, 'jobTitle') || 'a job')}</strong> has been shortlisted.</p><p>The client will be in touch if they would like to proceed.</p>`,
  },

  proposal_accepted: {
    // metadata: { jobTitle }
    subject: () => `Your proposal was accepted`,
    text: (c) =>
      `Congratulations — your proposal on ${m(c, 'jobTitle') || 'a job'} was accepted. A contract is being prepared for you to review.`,
    html: (c) => `<p>Congratulations — your proposal on <strong>${escapeHtml(m(c, 'jobTitle') || 'a job')}</strong> was accepted.</p><p>A contract is being prepared for you to review.</p>`,
  },

  proposal_rejected: {
    // metadata: { jobTitle }
    subject: () => `Update on your proposal`,
    text: (c) =>
      `Thank you for submitting a proposal on ${m(c, 'jobTitle') || 'a job'}. The client has decided to move in a different direction this time.`,
    html: (c) => `<p>Thank you for submitting a proposal on <strong>${escapeHtml(m(c, 'jobTitle') || 'a job')}</strong>.</p><p>The client has decided to move in a different direction this time. There are usually more opportunities matching your skills.</p>`,
  },

  contract_created: {
    // metadata: { contractTitle }
    subject: () => `A contract is ready for you to review`,
    text: (c) =>
      `A contract has been created for ${m(c, 'contractTitle') || 'your engagement'}. Review the scope and milestones before it becomes active.`,
    html: (c) => `<p>A contract has been created for <strong>${escapeHtml(m(c, 'contractTitle') || 'your engagement')}</strong>.</p><p>Review the scope and milestones before it becomes active.</p>`,
  },

  contract_accepted: {
    // metadata: { contractTitle }
    subject: () => `Contract accepted`,
    text: (c) =>
      `${plain(c.actorName) || 'The other party'} accepted the contract for ${m(c, 'contractTitle') || 'your engagement'}. It is now active.`,
    html: (c) => `<p><strong>${escapeHtml(plain(c.actorName) || 'The other party')}</strong> accepted the contract for <strong>${escapeHtml(m(c, 'contractTitle') || 'your engagement')}</strong>. It is now active.</p>`,
  },

  contract_completed: {
    // metadata: { contractTitle }
    subject: () => `Contract completed`,
    text: (c) =>
      `${m(c, 'contractTitle') || 'Your contract'} has been marked complete. You can now leave a review.`,
    html: (c) => `<p><strong>${escapeHtml(m(c, 'contractTitle') || 'Your contract')}</strong> has been marked complete.</p><p>You can now leave a review for the other party.</p>`,
  },

  milestone_created: {
    // metadata: { milestoneTitle, contractTitle }
    subject: (c) => `New milestone: ${m(c, 'milestoneTitle') || 'a milestone was added'}`,
    text: (c) =>
      `A milestone was added to ${m(c, 'contractTitle') || 'your contract'}: ${m(c, 'milestoneTitle') || 'Untitled milestone'}.`,
    html: (c) => `<p>A milestone was added to <strong>${escapeHtml(m(c, 'contractTitle') || 'your contract')}</strong>:</p><p><strong>${escapeHtml(m(c, 'milestoneTitle') || 'Untitled milestone')}</strong></p>`,
  },

  milestone_submitted: {
    // metadata: { milestoneTitle, contractTitle }
    subject: (c) => `Deliverable submitted: ${m(c, 'milestoneTitle') || 'a milestone'}`,
    text: (c) =>
      `${plain(c.actorName) || 'The consultant'} submitted the deliverable for ${m(c, 'milestoneTitle') || 'a milestone'}. Review and approve it to release payment.`,
    html: (c) => `<p><strong>${escapeHtml(plain(c.actorName) || 'The consultant')}</strong> submitted the deliverable for <strong>${escapeHtml(m(c, 'milestoneTitle') || 'a milestone')}</strong>.</p><p>Review and approve it to release payment.</p>`,
  },

  milestone_approved: {
    // metadata: { milestoneTitle, contractTitle }
    subject: (c) => `Milestone approved: ${m(c, 'milestoneTitle') || 'a milestone'}`,
    text: (c) =>
      `The client approved ${m(c, 'milestoneTitle') || 'a milestone'}. Escrowed funds can now be released.`,
    html: (c) => `<p>The client approved <strong>${escapeHtml(m(c, 'milestoneTitle') || 'a milestone')}</strong>.</p><p>Escrowed funds can now be released.</p>`,
  },

  milestone_revision: {
    // metadata: { milestoneTitle, notes }
    subject: (c) => `Changes requested: ${m(c, 'milestoneTitle') || 'a milestone'}`,
    text: (c) =>
      `Changes were requested on ${m(c, 'milestoneTitle') || 'a milestone'}.${m(c, 'notes') ? ` Notes: ${m(c, 'notes')}` : ''}`,
    html: (c) =>
      `<p>Changes were requested on <strong>${escapeHtml(m(c, 'milestoneTitle') || 'a milestone')}</strong>.</p>${m(c, 'notes') ? `<blockquote>${escapeHtml(m(c, 'notes'))}</blockquote>` : ''}`,
  },

  payment_escrowed: {
    // metadata: { amountFormatted, milestoneTitle }
    subject: () => `Payment received and held in escrow`,
    text: (c) =>
      `${m(c, 'amountFormatted') || 'Your payment'} for ${m(c, 'milestoneTitle') || 'a milestone'} has been received and is held in escrow. It is released when the milestone is approved.`,
    html: (c) =>
      `<p><strong>${escapeHtml(m(c, 'amountFormatted') || 'Your payment')}</strong> for ${escapeHtml(m(c, 'milestoneTitle') || 'a milestone')} has been received and is <strong>held in escrow</strong>.</p><p>Funds are released when the milestone is approved.</p>`,
  },

  payment_failed: {
    // metadata: { amountFormatted, reason }
    subject: () => `Payment failed`,
    text: (c) =>
      `Your payment${m(c, 'amountFormatted') ? ` of ${m(c, 'amountFormatted')}` : ''} could not be completed.${m(c, 'reason') ? ` Reason: ${m(c, 'reason')}` : ''} No funds have been taken.`,
    html: (c) =>
      `<p>Your payment${m(c, 'amountFormatted') ? ` of <strong>${escapeHtml(m(c, 'amountFormatted'))}</strong>` : ''} could not be completed.</p>${m(c, 'reason') ? `<p>Reason: ${escapeHtml(m(c, 'reason'))}</p>` : ''}<p>No funds have been taken.</p>`,
  },

  payment_released: {
    // metadata: { amountFormatted, milestoneTitle }
    subject: (c) => `Payment released: ${m(c, 'amountFormatted') || 'your funds'}`,
    text: (c) =>
      `${m(c, 'amountFormatted') || 'Escrowed funds'} for ${m(c, 'milestoneTitle') || 'a milestone'} have been released and are settling to your bank account.`,
    html: (c) =>
      `<p><strong>${escapeHtml(m(c, 'amountFormatted') || 'Escrowed funds')}</strong> for ${escapeHtml(m(c, 'milestoneTitle') || 'a milestone')} have been released and are settling to your bank account.</p>`,
  },

  message_received: {
    // metadata: { conversationTitle }
    subject: (c) => `New message from ${plain(c.actorName) || 'a contact'}`,
    text: (c) =>
      `${plain(c.actorName) || 'Someone'} sent you a message${m(c, 'conversationTitle') ? ` in ${m(c, 'conversationTitle')}` : ''}.`,
    html: (c) =>
      `<p><strong>${escapeHtml(plain(c.actorName) || 'Someone')}</strong> sent you a message${m(c, 'conversationTitle') ? ` in <strong>${escapeHtml(m(c, 'conversationTitle'))}</strong>` : ''}.</p>`,
  },

  review_submitted: {
    // metadata: { rating, milestoneTitle }
    subject: (c) => `You received a ${m(c, 'rating') || 'new'} star review`,
    text: (c) =>
      `${plain(c.actorName) || 'A counterparty'} left you a ${m(c, 'rating') || 'new'}-star review.`,
    html: (c) =>
      `<p><strong>${escapeHtml(plain(c.actorName) || 'A counterparty')}</strong> left you a <strong>${escapeHtml(m(c, 'rating') || 'new')}-star review</strong>.</p>`,
  },

  dispute_opened: {
    // metadata: { reason, contractTitle }
    subject: () => `A dispute has been opened`,
    text: (c) =>
      `${plain(c.actorName) || 'A counterparty'} opened a dispute on ${m(c, 'contractTitle') || 'your contract'}.${m(c, 'reason') ? ` Reason: ${m(c, 'reason')}` : ''} Escrowed funds are held while this is resolved.`,
    html: (c) =>
      `<p><strong>${escapeHtml(plain(c.actorName) || 'A counterparty')}</strong> opened a dispute on <strong>${escapeHtml(m(c, 'contractTitle') || 'your contract')}</strong>.</p>${m(c, 'reason') ? `<p>Reason: ${escapeHtml(m(c, 'reason'))}</p>` : ''}<p><strong>Escrowed funds are held while this is resolved.</strong></p>`,
  },

  dispute_resolved: {
    // metadata: { outcome, contractTitle }
    subject: () => `Your dispute has been resolved`,
    text: (c) =>
      `The dispute on ${m(c, 'contractTitle') || 'your contract'} has been resolved: ${m(c, 'outcome') || 'see the details'}.`,
    html: (c) =>
      `<p>The dispute on <strong>${escapeHtml(m(c, 'contractTitle') || 'your contract')}</strong> has been resolved.</p><p>Outcome: ${escapeHtml(m(c, 'outcome') || 'see the details')}</p>`,
  },

  system_alert: {
    subject: (c) => plain(ctxSubject(c)),
    text: (c) => m(c, 'body') || 'There is an update to your account.',
    html: (c) => `<p>${escapeHtml(m(c, 'body') || 'There is an update to your account.')}</p>`,
  },
};

function ctxSubject(ctx: TemplateContext): string {
  return m(ctx, 'title') || 'Account update';
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function greeting(ctx: TemplateContext): string {
  const name = plain(ctx.recipientName);
  return name ? `Hi ${name},` : 'Hi,';
}

function ctaUrl(ctx: TemplateContext, path?: string): string {
  const base = (ctx.appUrl || 'http://localhost:3000').replace(/\/+$/, '');
  return path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base;
}

/**
 * Render a notification type into a complete email.
 *
 * An unknown type falls back to the subject/body the emitting code supplied rather
 * than throwing. A template that does not exist must not take down the delivery
 * pipeline for every other notification; it degrades to a plain message.
 */
export function renderEmail(
  type: NotificationType,
  ctx: TemplateContext
): RenderedEmail {
  const definition = TEMPLATES[type];
  const subject = definition ? definition.subject(ctx) : plain(ctx.actorName) || 'Notification';
  const text = definition ? definition.text(ctx) : m(ctx, 'body') || '';
  const bodyHtml = definition
    ? definition.html(ctx)
    : `<p>${escapeHtml(m(ctx, 'body') || 'You have a new notification.')}</p>`;

  const text_ = `${greeting(ctx)}\n\n${text}\n\n— ${'SAP Integration Marketplace'}`;

  return {
    subject: plain(subject).slice(0, 200),
    text: text_,
    html: wrapHtml(subject, greeting(ctx), bodyHtml, ctaUrl(ctx)),
  };
}

function wrapHtml(
  subject: string,
  greetingText: string,
  bodyHtml: string,
  url: string
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
    <tr><td style="padding:24px 24px 8px;">
      <p style="margin:0 0 16px;font-size:15px;">${escapeHtml(greetingText)}</p>
      ${bodyHtml}
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;">Open the marketplace</a>
      </p>
    </td></tr>
    <tr><td style="padding:16px 24px 24px;border-top:1px solid #e4e7eb;">
      <p style="margin:0;font-size:13px;color:#616e7c;">
        You are receiving this because you have notifications enabled for this type.
        Manage your preferences in your account settings.
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#616e7c;">
        <a href="${escapeHtml(url)}" style="color:#2563eb;">Unsubscribe from email notifications</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

/** The link a recipient is pointed at, used as the email's `asm`/unsubscribe target. */
export function preferencesUrl(appUrl?: string): string {
  return ctaUrl({ appUrl }, '/settings/notifications');
}
