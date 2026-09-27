/**
 * Transactional email channel, via the SendGrid v3 Mail Send API.
 *
 * Every API detail below was taken from SendGrid's own documentation and the
 * shipped type declarations rather than from memory. The four that are easy to get
 * wrong, and why this file looks the way it does:
 *
 *   1. `send()` resolves a TUPLE `[ClientResponse, data]`, not a bare response.
 *      The status code lives on element zero.
 *   2. `asm` is CAMELCASE in the SDK (`groupId`, `groupsToDisplay`). The
 *      snake_case form is the wire format and does not type-check.
 *   3. A successful send returns 202 with an empty body.
 *   4. On failure, `error.message` is the HTTP status TEXT ("Bad Request"), not an
 *      explanation. The useful detail is in `error.response.body.errors[]`. The
 *      SDK's own type declaration calls that field a `string` while the runtime
 *      assigns a parsed object, so it is read through a narrow local cast.
 *
 * When `SENDGRID_API_KEY` is absent the channel reports `skipped` rather than
 * failing. A development or test environment without a key must look like "email is
 * not switched on", not like a broken notification pipeline.
 */

import sgMail from '@sendgrid/mail';
import { env } from '@/config/env';
import {
  renderEmail,
  preferencesUrl,
  type RenderedEmail,
  type TemplateContext,
} from '../email-templates';
import type {
  ChannelDeliveryContext,
  DeliveryOutcome,
  NotificationChannel,
} from '../types';

/**
 * SendGrid success is 202 Accepted with an empty body; 2xx generally.
 * 202 and 200 are both success; anything >= 400 is handled as an error by the
 * client, so this only has to accept the documented success codes.
 */
const SENDGRID_SUCCESS_STATUSES = new Set([200, 202]);

/** HTTP status -> retry hint in seconds, from the documented failure modes. */
const RETRY_AFTER_SECONDS: Record<number, number> = {
  413: 60 * 60, // content too large: will not fix itself quickly
  429: 60, // rate limited: retry soon
  500: 60, // provider internal error
};

/** Raised by SendGrid for any HTTP response >= 400. */
interface SendGridResponseError {
  code: number;
  message: string;
  response?: {
    body?: unknown;
    headers?: Record<string, string>;
  };
}

let configured = false;

/**
 * Apply the API key once, lazily.
 *
 * Laziness matters for two reasons: the SDK is constructed at import time, and a
 * build without a key must not throw, and calling `setApiKey` on every send would
 * re-stamp the key for no benefit.
 */
function ensureConfigured(): boolean {
  const apiKey = env.SENDGRID_API_KEY;
  if (!apiKey) return false;
  if (!configured) {
    sgMail.setApiKey(apiKey);
    configured = true;
  }
  return true;
}

/**
 * `customArgs` are the minimum provider-side correlation handle.
 *
 * SendGrid echoes these back on the message's activity record, so one identifier
 * that joins to our own `notifications` row is enough for support to trace a
 * delivered or bounced email back to the delivery ledger. Everything else this
 * channel used to send has been removed deliberately:
 *
 *   - `user_id` was never sent, and never should be. A recipient address already
 *     identifies the person; repeating their internal id to a third party adds
 *     exposure and buys nothing.
 *   - `entity_id` / `entity_type` / `notification_type` are all reachable by
 *     joining on `notification_id`. They are internal schema detail, and
 *     `entity_id` in particular carries compound values such as
 *     `<milestoneId>@<submissionId>` that are meaningless outside this database.
 *
 * The rule applied: send a third party only what cannot be derived from what is
 * already sent, and nothing that is sensitive. No user id, no contact data, no
 * message content travels in `customArgs`.
 *
 * Values must be strings and short, per SendGrid's limit.
 */
function toCustomArgs(
  context: ChannelDeliveryContext
): Record<string, string> | undefined {
  // The single handle that correlates a provider-side message to our own row.
  const args: Record<string, string> = { notification_id: context.notificationId };
  if (!Object.keys(args).length) return undefined;
  return args;
}

/**
 * Build the SendGrid `asm` (suppression) block.
 *
 * Suppression group ids are account-specific sequential integers, so a hardcoded
 * value such as `1` does not exist on a fresh account and SendGrid rejects the
 * whole send with a 400. The group is therefore read from
 * `SENDGRID_ASM_GROUP_ID` and omitted entirely when unset, which SendGrid accepts
 * — the account's own list-management settings still apply, and
 * `bypassListManagement` is deliberately never set, so an unsubscribe is honoured
 * either way.
 *
 * Returns undefined rather than a fake group so the caller's object does not
 * contain a misleading `asm` key.
 */
function buildAsm(): { groupId: number; groupsToDisplay: number[] } | undefined {
  const groupId = env.SENDGRID_ASM_GROUP_ID;
  if (groupId === undefined) return undefined;
  return { groupId, groupsToDisplay: [groupId] };
}

export const emailChannel: NotificationChannel = {
  name: 'email',

  isConfigured() {
    return Boolean(env.SENDGRID_API_KEY);
  },

  async deliver(context: ChannelDeliveryContext): Promise<DeliveryOutcome> {
    if (!ensureConfigured()) {
      return {
        status: 'skipped',
        reason: 'SENDGRID_API_KEY is not configured; transactional email is disabled.',
      };
    }
    if (!context.email) {
      // The recipient has no address on file. Skipped rather than failed: there
      // is nothing to retry and nothing to alert on.
      return { status: 'skipped', reason: 'Recipient has no email address on file.' };
    }

    const templateContext: TemplateContext = {
      recipientName: context.displayName ?? null,
      actorName: (context.metadata?.actorName as string) ?? null,
      metadata: context.metadata ?? {},
      appUrl: env.NEXT_PUBLIC_APP_URL,
    };

    let rendered: RenderedEmail;
    try {
      rendered = renderEmail(context.type, templateContext);
    } catch (error) {
      // A template bug must not be retried forever: it will fail identically
      // every time, so it is reported as a non-retryable failure.
      return {
        status: 'failed',
        error: `Email template could not be rendered: ${(error as Error).message}`.slice(0, 500),
      };
    }

    const asm = buildAsm();

    try {
      const [response] = await sgMail.send({
        to: { email: context.email, name: context.displayName ?? undefined },
        from: {
          email: env.EMAIL_FROM,
          // No display name override on the From address: a spoofable "Reply"
          // identity in a marketplace email is a phishing aid, and the address
          // alone is unambiguous.
          name: env.NEXT_PUBLIC_APP_NAME,
        },
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        // Only attached when a group is configured. See buildAsm.
        ...(asm ? { asm } : {}),
        customArgs: toCustomArgs(context),
      });

      if (!SENDGRID_SUCCESS_STATUSES.has(response?.statusCode)) {
        return {
          status: 'failed',
          error: `SendGrid returned HTTP ${response?.statusCode ?? 'unknown'}.`,
        };
      }

      // SendGrid returns an empty body for a plain 202, so the x-message-id header
      // is the useful correlation handle when it is present.
      return {
        status: 'sent',
        providerMessageId: response?.headers?.['x-message-id'] ?? null,
      };
    } catch (error) {
      const sendError = error as SendGridResponseError;
      const status = typeof sendError?.code === 'number' ? sendError.code : 0;

      // Per-field detail lives in response.body.errors[], not in error.message,
      // which is just the HTTP status text. The SDK types this field as a string
      // while the runtime assigns parsed JSON, hence the narrow read.
      const detail = readSendGridErrorDetail(sendError);

      return {
        status: 'failed',
        error: `SendGrid error ${status || '(network)'}: ${detail}`.slice(0, 500),
        ...(RETRY_AFTER_SECONDS[status] !== undefined
          ? { retryAfterSeconds: RETRY_AFTER_SECONDS[status] }
          : {}),
      };
    }
  },
};

function readSendGridErrorDetail(error: SendGridResponseError): string {
  const body = error?.response?.body as
    | { errors?: Array<{ message?: string; field?: string | null }> }
    | undefined;

  if (body && Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors
      .map((e) => [e.field, e.message].filter(Boolean).join(': '))
      .join('; ')
      .slice(0, 300);
  }
  // Fall back to the status text. Never a credential: the SDK does not put the
  // Authorization header in either the message or the body.
  return String(error?.message || 'Unknown error').slice(0, 300);
}

/** Exposed for the unsubscribe link rendered into the template footer. */
export function emailPreferencesUrl(): string {
  return preferencesUrl(env.NEXT_PUBLIC_APP_URL);
}
