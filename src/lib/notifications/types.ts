/**
 * Notification domain types.
 *
 * The channel contract here is the extension point the Stage 12 brief asks for.
 * A new channel (SMS, push, webhook) is a class implementing `NotificationChannel`
 * plus one line in the registry in `channels/index.ts`. No database migration is
 * required, because `notification_deliveries.channel` is TEXT rather than an enum
 * precisely so that adding a channel is a code change.
 *
 * The event type union mirrors the `notification_type` PostgreSQL enum created in
 * migration 00001 and extended in 00013. The four values added by 00013
 * (`proposal_rejected`, `milestone_created`, `payment_failed`,
 * `contract_completed`) are the ones the Stage 1 schema never had; without them
 * four of the fourteen required events had nowhere to be recorded.
 */

import { z } from 'zod';
import type { NotificationType as DatabaseNotificationType } from '@/types/database';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * The canonical list of notification types, mirroring the `notification_type`
 * PostgreSQL enum.
 *
 * This array is the single source of truth: the Zod enum below is derived from it
 * with `z.enum`, so a value can never be accepted by validation but rejected by
 * the database. The compile-time assertion at the bottom of this block pins it to
 * the `NotificationType` union in `@/types/database`, which is what the rest of
 * the codebase imports, so the two cannot drift apart silently.
 *
 * The four values added by migration 00013 are `proposal_rejected`,
 * `milestone_created`, `payment_failed` and `contract_completed`. Stage 1 had no
 * variant for any of those, so four of the fourteen required events previously had
 * nowhere to be recorded.
 */
export const NOTIFICATION_TYPES = [
  'proposal_received',
  'proposal_shortlisted',
  'proposal_accepted',
  'proposal_rejected',
  'contract_created',
  'contract_accepted',
  'contract_completed',
  'milestone_created',
  'milestone_submitted',
  'milestone_approved',
  'milestone_revision',
  'payment_escrowed',
  'payment_failed',
  'payment_released',
  'message_received',
  'review_submitted',
  'dispute_opened',
  'dispute_resolved',
  'system_alert',
] as const satisfies readonly DatabaseNotificationType[];

export const notificationTypeEnum = z.enum(NOTIFICATION_TYPES);

export type NotificationType = z.infer<typeof notificationTypeEnum>;

/**
 * Exhaustiveness guard. If a value is added to `NOTIFICATION_TYPES` but not to
 * `NotificationType` in `@/types/database`, or removed from one and not the
 * other, this stops compiling. `Record<NotificationType, true>` demands a key for
 * every member of the union; the conditional demands the key set be no wider.
 */
type _AssertSameAsDatabase =
  Record<NotificationType, true> extends Record<DatabaseNotificationType, true>
    ? DatabaseNotificationType extends NotificationType
      ? true
      : never
    : never;
const _exhaustiveness: _AssertSameAsDatabase = true;
void _exhaustiveness;

/**
 * Channels.
 *
 * Not an enum. A const array is enough to type the known channels while still
 * allowing a string, so a newly registered channel is not a compile error in the
 * preference layer.
 */
export const KNOWN_CHANNELS = ['in_app', 'email'] as const;
export type KnownChannel = (typeof KNOWN_CHANNELS)[number];
export type ChannelName = KnownChannel | (string & {});

export const CHANNEL_IN_APP = 'in_app' as const;
export const CHANNEL_EMAIL = 'email' as const;

// ---------------------------------------------------------------------------
// The event
// ---------------------------------------------------------------------------

/**
 * An emit request. Constructed by the service layer at the moment something
 * happens; never assembled from a request body.
 *
 * `dedupKey` is what makes "no duplicate notifications for the same event" a
 * database guarantee. It must be a deterministic function of the event, never a
 * timestamp or a random value, so that a retry or a redelivered webhook computes
 * the same string and loses the unique index rather than creating a second row.
 * `buildDedupKey` constructs it from the parts that identify the event.
 */
export interface NotificationEvent {
  /** The recipient. The only party that ever receives this event. */
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Where the in-app notification links to. A same-origin path, never a URL. */
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Who caused the event, when that is meaningful. */
  actorUserId?: string | null;
  /**
   * Display name of the actor, resolved by the emitting code. Kept alongside
   * `actorUserId` so an email can greet and attribute without the template
   * issuing a lookup, and so a name still renders for a row whose actor has since
   * been deleted (`actorUserId` is ON DELETE SET NULL).
   */
  actorName?: string | null;
  /** Template variables. Rendered into the email, never trusted as HTML. */
  metadata?: Record<string, string | number | null | undefined>;
  /**
   * Explicit dedup key. Prefer letting `emit` derive it via `dedupKeyFor` unless
   * the event has no natural entity identity (a system alert, say), in which case
   * omitting it makes the notification deliberately non-deduplicated.
   */
  dedupKey?: string | null;
  /** Restrict delivery to these channels. Defaults to all registered channels. */
  channels?: ChannelName[];
}

// ---------------------------------------------------------------------------
// Channel contract
// ---------------------------------------------------------------------------

/**
 * What a channel is handed after the notification row exists.
 *
 * A channel never decides whether it should be delivered to a recipient — that is
 * the service's job, using preferences. A channel only knows how to express
 * itself, and how to report the outcome.
 */
export interface ChannelDeliveryContext {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, string | number | null | undefined>;
  /** The recipient's address, resolved by the service. Absent for in_app. */
  email?: string | null;
  /** Display name used as the greeting. */
  displayName?: string | null;
}

export type DeliveryOutcome =
  /** The channel accepted it. */
  | { status: 'sent'; providerMessageId?: string | null }
  /** The channel is not configured (for example no API key), so nothing was sent. */
  | { status: 'skipped'; reason: string }
  /** A retryable failure. `retryAfterSeconds` is a hint, not a guarantee. */
  | { status: 'failed'; error: string; retryAfterSeconds?: number };

export interface NotificationChannel {
  readonly name: ChannelName;
  /**
   * Whether this channel can currently deliver anything. A channel that is not
   * configured reports `skipped` rather than failing, so a missing API key in
   * development never looks like a broken notification pipeline.
   */
  isConfigured(): boolean;
  deliver(context: ChannelDeliveryContext): Promise<DeliveryOutcome>;
}

// ---------------------------------------------------------------------------
// Stored records
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface NotificationDelivery {
  id: string;
  notification_id: string;
  channel: string;
  status: DeliveryStatus;
  attempt_count: number;
  provider_message_id: string | null;
  last_error: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  dedup_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  user_id: string;
  type: NotificationType;
  channel: string;
  enabled: boolean;
  updated_at: string;
}
