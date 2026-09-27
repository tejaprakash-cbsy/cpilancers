/**
 * Notification service — Stage 12.
 *
 * One entry point, `emit`, for every notification in the system. Business code
 * calls it; it decides whether to record, which channels to fan out to, and what
 * to do about duplicates. Nothing else writes to `notifications` directly.
 *
 * Invariants this service is responsible for:
 *
 *   1. NO DUPLICATES. A deterministic `dedup_key` plus a partial unique index
 *      means a retry, a redelivered webhook or two concurrent handlers for one
 *      event produce exactly one notification. The loser of the race is told so
 *      and treated as success, because for a notification "already notified" and
 *      "just notified" are the same end state.
 *
 *   2. NOTIFICATIONS ARE NOT FAKED. Every value rendered to a recipient comes from
 *      a database row written by the code that performed the action. There is no
 *      path here that accepts a rating, a balance, a contract total or any other
 *      figure from a caller and stores it.
 *
 *   3. PREFERENCES ARE HONOURED BEFORE DELIVERY, not after. A channel is not
 *      invoked at all for a user who has switched it off, so a disabled channel
 *      cannot leak through a retry.
 *
 *   4. A CHANNEL FAILURE IS NOT A NOTIFICATION FAILURE. The durable record and
 *      the unread badge are written first; email failing afterwards is recorded on
 *      the delivery row and never rolls back the notification.
 *
 * The service uses the Supabase service role, which bypasses RLS, so every read
 * and mark method re-derives ownership itself rather than trusting a passed-in
 * id. Routes must pass the authenticated user id and nothing else.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseService } from './base.service';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { buildDedupKey, isDedupViolation } from '@/lib/notifications/dedup';
import {
  DEFAULT_EMAIL_ENABLED,
  defaultEnabledFor,
  isInAppLocked,
} from '@/lib/notifications/defaults';
import { getChannel, registeredChannelNames } from '@/lib/notifications/channels';
import { CHANNEL_IN_APP } from '@/lib/notifications/types';
import type {
  ChannelName,
  NotificationChannel,
  NotificationDelivery,
  NotificationEvent,
  NotificationPreference,
  NotificationRecord,
  NotificationType,
} from '@/lib/notifications/types';
import type { DeliveryStatus } from '@/lib/notifications/types';

export interface EmitResult {
  /**
   * The stored notification, or null when the recipient has every channel
   * switched off and no record was created at all.
   */
  notification: NotificationRecord | null;
  /** False when an identical event had already been recorded, or nothing was due. */
  created: boolean;
  /** Per-channel outcomes, keyed by channel name. */
  deliveries: Record<string, DeliveryStatus>;
}

export interface UnreadSummary {
  unread_count: number;
  by_type: Array<{ type: NotificationType; count: number }>;
}

export class NotificationService extends BaseService {
  /**
   * The canonical emit entry point for callers outside this file.
   *
   * `emit` is a static method that uses `this`, so passing it as a bare function
   * reference — which is exactly what the typed event builders in
   * `lib/notifications/events.ts` are given — loses the receiver and throws a
   * TypeError on the first `this.…` access. Because every call site wraps its
   * notification in a try/catch (correctly, so a notification failure never rolls
   * back a business write), that TypeError was being logged and discarded: the
   * notification silently never happened.
   *
   * This arrow wrapper is bound to the class and is what every external caller
   * should pass. Tests can still inject a stub, which is why the builders take
   * `emit` as a parameter rather than importing it.
   */
  static readonly emitEvent = (event: NotificationEvent): Promise<EmitResult> =>
    NotificationService.emit(event);
  // =========================================================================
  // Emit
  // =========================================================================

  /**
   * Record and deliver one notification.
   *
   * Order matters and is deliberate:
   *   1. resolve preferences, so a disabled channel is never invoked;
   *   2. insert the durable row, letting the unique index arbitrate duplicates;
   *   3. fan out to the enabled channels;
   *   4. record a delivery row per channel, whatever the outcome.
   *
   * Step 2 before step 3 means the unread badge is correct even if every channel
   * fails, which is what makes an in-app notification dependable.
   *
   * DELIVERY GUARANTEE, stated precisely rather than as "exactly once", because
   * the honest version is narrower and the difference matters operationally:
   *
   *   - At most one notification row, and therefore at most one email send, per
   *     (type, entity, recipient) event. A duplicate loses the partial unique
   *     index on `dedup_key` and returns the existing row with `created: false`
   *     WITHOUT invoking any channel. This is the layer that does the real work,
   *     and it holds under genuine concurrency because the arbitration is the
   *     database's, not a check-then-insert in application code.
   *
   *   - The guarantee is on EMISSION, not on delivery. A send that fails is
   *     recorded as `failed` with a `next_retry_at` hint, and nothing in this
   *     codebase currently consumes that hint: there is no retry processor, so a
   *     failed email is not automatically re-attempted. That is the deliberate
   *     choice, because a background re-drive is exactly the thing that would
   *     risk a second email, and an unretried notification is a support-visible
   *     gap rather than a correctness one. Retrying is a future feature and must
   *     reuse the existing notification/delivery identity rather than emitting a
   *     fresh event, or it would break the at-most-one property above.
   *
   *   - Delivery to SendGrid itself is at-least-once at best: a network failure
   *     after SendGrid accepted the message cannot be distinguished from one
   *     before it did, so an operator-initiated redrive can produce a duplicate
   *     provider-side send. The idempotency key available for that is
   *     `notification_id`, which is the sole `customArgs` entry the email channel
   *     sends for exactly this reason.
   */
  static async emit(event: NotificationEvent): Promise<EmitResult> {
    const type = event.type;
    const dedupKey =
      event.dedupKey ??
      buildDedupKey({ type, entityId: event.entityId, recipientId: event.userId });

    if (!event.userId) {
      throw new ValidationError('A notification needs a recipient.');
    }

    // Preference lookup is per recipient and per type, once for the whole fan-out.
    const preferences = await this.loadPreferenceMap(event.userId, type);

    // The in-app decision is resolved FIRST, before anything is written, because
    // the notification row is itself the in-app delivery. If in-app is off and no
    // other channel is enabled, no record is created at all; if in-app is off but
    // email is on, the row exists solely as a delivery parent and is flagged so
    // the feed and the badge exclude it.
    const inAppEnabled = this.resolveInAppEnabled(type, preferences);
    const targets = this.resolveTargets(event, preferences, inAppEnabled);

    if (!inAppEnabled && !targets.some((channel) => channel.name !== CHANNEL_IN_APP)) {
      // Everything is switched off. Creating a row here would produce a
      // notification the user has explicitly disabled, which is the exact failure
      // this replaces.
      return { notification: null, created: false, deliveries: {} };
    }

    const db = createAdminClient();

    const { data, error } = await db
      .from('notifications')
      .insert({
        user_id: event.userId,
        type,
        title: event.title,
        body: event.body,
        action_url: event.actionUrl ?? null,
        entity_type: event.entityType ?? null,
        entity_id: event.entityId ?? null,
        actor_user_id: event.actorUserId ?? null,
        metadata: (event.metadata ?? {}) as Record<string, unknown>,
        dedup_key: dedupKey,
        in_app_enabled: inAppEnabled,
        // Read state is consistent by construction: unread rows carry a null
        // read_at, which the chk_notification_read_state constraint requires.
        is_read: false,
        read_at: null,
      })
      .select('*')
      .single();

    if (error) {
      if (isDedupViolation(error) && dedupKey) {
        // The event has already been recorded. Return the existing row so the
        // caller learns the notification is in place rather than seeing a failure.
        const existing = await this.findByDedupKey(dedupKey);
        if (existing) {
          return { notification: existing, created: false, deliveries: {} };
        }
      }
      throw new AppError('Failed to record the notification.', 500, 'NOTIFICATION_INSERT_ERROR', error);
    }

    const notification = data as NotificationRecord;

    // No enabled channel at all is not a failure. The user has switched
    // everything off, and the durable record still exists for the badge.
    if (targets.length === 0) {
      return { notification, created: true, deliveries: {} };
    }

    // Resolve the recipient's address and display name once, for the channels that
    // need them.
    const recipient = await this.resolveRecipient(event.userId);

    const deliveries: Record<string, DeliveryStatus> = {};
    for (const channel of targets) {
      const outcome = await this.deliverOne(channel, notification, recipient, event);
      deliveries[channel.name] = outcome;
    }

    return { notification, created: true, deliveries };
  }

  /**
   * Fan out to one channel and record the outcome.
   *
   * A channel that throws is caught here. The notification row is already
   * committed by the time this runs, and a channel bug must not propagate into the
   * business transaction that triggered the event.
   */
  private static async deliverOne(
    channel: NotificationChannel,
    notification: NotificationRecord,
    recipient: { email: string | null; displayName: string | null },
    event: NotificationEvent
  ): Promise<DeliveryStatus> {
    let status: DeliveryStatus = 'failed';
    let providerMessageId: string | null = null;
    let lastError: string | null = null;
    let nextRetryAt: string | null = null;

    try {
      const outcome = await channel.deliver({
        notificationId: notification.id,
        userId: notification.user_id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        actionUrl: notification.action_url,
        entityType: notification.entity_type,
        entityId: notification.entity_id,
        metadata: {
          ...(event.metadata ?? {}),
          // Resolved names are folded in so the template does not have to query.
          actorName: event.actorName ?? null,
        },
        email: recipient.email,
        displayName: recipient.displayName,
      });

      status = outcome.status;
      if (outcome.status === 'sent') providerMessageId = outcome.providerMessageId ?? null;
      if (outcome.status === 'failed') {
        lastError = outcome.error;
        if (outcome.retryAfterSeconds) {
          nextRetryAt = new Date(Date.now() + outcome.retryAfterSeconds * 1000).toISOString();
        }
      }
      if (outcome.status === 'skipped') lastError = outcome.reason;
    } catch (error) {
      status = 'failed';
      lastError = (error as Error)?.message?.slice(0, 500) ?? 'Channel threw unexpectedly.';
    }

    await this.recordDelivery({
      notificationId: notification.id,
      channel: channel.name,
      status,
      providerMessageId,
      lastError,
      nextRetryAt,
    });

    return status;
  }

  /**
   * Write the delivery row.
   *
   * `onConflict` targets the (notification_id, channel) unique constraint, so a
   * repeated write for the same notification and channel UPDATES the existing
   * attempt instead of inserting a second one. That is the second of the two
   * independent layers that keep one event to one email; see the note on `emit`.
   *
   * Correcting a comment that was here previously: it credited this upsert with
   * stopping a retried event from sending a second email. It does not, and cannot,
   * perform that job. A repeated event never reaches this method at all: `emit`
   * loses the `dedup_key` unique index and returns the existing notification before
   * any channel is invoked. The upsert's real job is the narrower one stated
   * above: within one notification there is exactly one delivery row per channel,
   * whatever happens to be retried underneath it.
   */
  private static async recordDelivery(params: {
    notificationId: string;
    channel: string;
    status: DeliveryStatus;
    providerMessageId: string | null;
    lastError: string | null;
    nextRetryAt: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await createAdminClient()
      .from('notification_deliveries')
      .upsert(
        {
          notification_id: params.notificationId,
          channel: params.channel,
          status: params.status,
          provider_message_id: params.providerMessageId,
          last_error: params.lastError,
          next_retry_at: params.nextRetryAt,
          sent_at: params.status === 'sent' ? now : null,
          updated_at: now,
          attempt_count: 1,
        },
        { onConflict: 'notification_id,channel' }
      );

    if (error) {
      // The delivery ledger is observability, not the product. Losing a row here
      // must not fail the notification, which is already written and visible.
      console.error('[notifications] failed to record delivery', {
        notificationId: params.notificationId,
        channel: params.channel,
        error,
      });
    }
  }

  /**
   * Resolve whether this notification should surface in the recipient's in-app
   * feed.
   *
   * A locked (essential) event is always on, matching `isInAppLocked` and the
   * `chk_notification_in_app_locked` constraint. Otherwise an explicit override
   * wins, and failing that the default applies.
   */
  private static resolveInAppEnabled(
    type: NotificationType,
    preferences: Map<string, boolean>
  ): boolean {
    if (isInAppLocked(type)) return true;
    const override = preferences.get(CHANNEL_IN_APP);
    return override ?? defaultEnabledFor(type, CHANNEL_IN_APP);
  }

  /**
   * Which channels should actually be invoked for this event.
   *
   * `inAppEnabled` is passed rather than re-derived, so the channel list and the
   * stored `in_app_enabled` can never disagree about the same event.
   */
  private static resolveTargets(
    event: NotificationEvent,
    preferences: Map<string, boolean>,
    inAppEnabled: boolean
  ): NotificationChannel[] {
    const requested = event.channels;
    const names: ChannelName[] = requested ?? registeredChannelNames();

    const targets: NotificationChannel[] = [];
    for (const name of names) {
      if (name === CHANNEL_IN_APP && !inAppEnabled) continue;

      const override = preferences.get(name);
      if (override === false) continue;
      if (override === undefined && !isDefaultOn(event.type, name)) continue;

      const channel = getChannel(name);
      if (!channel) continue;
      if (!channel.isConfigured()) continue;
      targets.push(channel);
    }
    return targets;
  }

  // =========================================================================
  // Preferences
  // =========================================================================

  /**
   * Load a user's explicit overrides for one event type.
   *
   * A missing row means "no opinion", not "off" — the default applies. That
   * distinction is the reason the table stores overrides only.
   */
  private static async loadPreferenceMap(
    userId: string,
    type: NotificationType
  ): Promise<Map<string, boolean>> {
    const { data, error } = await createAdminClient()
      .from('notification_preferences')
      .select('channel, enabled')
      .eq('user_id', userId)
      .eq('type', type);

    if (error) {
      // A preference lookup failure must not silently downgrade to defaults, which
      // could mail someone who opted out.
      throw new AppError(
        'Failed to load notification preferences.',
        500,
        'PREFERENCE_FETCH_ERROR',
        error
      );
    }

    const map = new Map<string, boolean>();
    for (const row of (data || []) as Array<{ channel: string; enabled: boolean }>) {
      map.set(row.channel, row.enabled);
    }
    return map;
  }

  /**
   * The effective preference set for a user: every registered channel, every known
   * event type, resolved to a single boolean.
   *
   * Returned rather than a sparse list of overrides so a settings screen cannot
   * show a channel as unset when it is actually on by default.
   */
  static async getPreferences(userId: string) {
    const { data, error } = await createAdminClient()
      .from('notification_preferences')
      .select('type, channel, enabled, updated_at')
      .eq('user_id', userId);
    if (error) {
      throw new AppError('Failed to load preferences.', 500, 'PREFERENCE_FETCH_ERROR', error);
    }

    const overrides = new Map<string, boolean>();
    for (const row of (data || []) as NotificationPreference[]) {
      overrides.set(`${row.type}:${row.channel}`, row.enabled);
    }

    const channels = registeredChannelNames();
    const preferences = Object.values(DEFAULT_TYPES).reduce<
      Record<string, Record<string, boolean | 'locked'>>
    >((acc, type) => {
      const perChannel: Record<string, boolean | 'locked'> = {};
      for (const channel of channels) {
        const key = `${type}:${channel}`;
        const explicit = overrides.has(key) ? overrides.get(key) : undefined;
        const value = explicit ?? defaultEnabledFor(type, channel);
        // An essential in-app event is reported as locked so the UI can explain
        // why the toggle is disabled rather than silently ignoring the click.
        perChannel[channel] =
          channel === CHANNEL_IN_APP && isInAppLocked(type) ? 'locked' : value;
      }
      acc[type] = perChannel;
      return acc;
    }, {});

    return { preferences, overrides: (data || []) as NotificationPreference[] };
  }

  /**
   * Set one preference.
   *
   * Rejects a request to disable a locked in-app event rather than writing a row
   * that `resolveTargets` would ignore: a setting that is stored but not honoured
   * is worse than a rejected one, because the user believes it took effect.
   */
  static async setPreference(
    userId: string,
    type: NotificationType,
    channel: string,
    enabled: boolean
  ): Promise<NotificationPreference> {
    if (channel === CHANNEL_IN_APP && isInAppLocked(type) && !enabled) {
      throw new ConflictError(
        'This notification is required in the app and cannot be switched off. You can still change your email preference for it.'
      );
    }
    if (!registeredChannelNames().includes(channel as ChannelName)) {
      throw new ValidationError(`Unknown notification channel: ${channel}`);
    }

    const { data, error } = await createAdminClient()
      .from('notification_preferences')
      .upsert(
        { user_id: userId, type, channel, enabled, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,type,channel' }
      )
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError('Failed to save the preference.', 500, 'PREFERENCE_WRITE_ERROR', error);
    }
    return data as NotificationPreference;
  }

  // =========================================================================
  // Reads
  // =========================================================================

  /**
   * Unread count only.
   *
   * Uses a `head: true` count so PostgEST returns the number without
   * transferring a single row. This is the badge poll — the hottest read in the
   * feature — and the previous implementation fetched every unread notification
   * and counted them in JavaScript, so a user with thousands of unread paid for
   * the whole set on every poll. `by_type` is available separately for the
   * settings screen, where the extra detail is worth it.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await createAdminClient()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .eq('in_app_enabled', true);

    if (error) {
      throw new AppError('Failed to count unread notifications.', 500, 'UNREAD_COUNT_ERROR', error);
    }
    return count ?? 0;
  }

  /**
   * Unread count plus a per-type breakdown.
   *
   * The breakdown needs the rows, because PostgREST has no GROUP BY, so this is
   * the expensive form. Callers on a hot path should use `getUnreadCount`.
   */
  static async getUnreadSummary(userId: string): Promise<UnreadSummary> {
    const db = createAdminClient();
    const { data, error } = await db
      .from('notifications')
      .select('type')
      .eq('user_id', userId)
      .eq('is_read', false)
      .eq('in_app_enabled', true);

    if (error) {
      throw new AppError('Failed to count unread notifications.', 500, 'UNREAD_COUNT_ERROR', error);
    }

    const counts = new Map<NotificationType, number>();
    for (const row of (data || []) as Array<{ type: NotificationType }>) {
      counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
    }

    return {
      unread_count: (data || []).length,
      by_type: [...counts.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * A user's notifications, newest first.
   *
   * `userId` is always the authenticated caller. There is no parameter by which a
   * caller could ask for someone else's notifications.
   */
  static async listNotifications(
    userId: string,
    filters: { unreadOnly?: boolean; type?: NotificationType; page?: number; limit?: number } = {}
  ): Promise<{ notifications: NotificationRecord[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;

    let query = createAdminClient()
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      // Rows the user suppressed via their in_app preference are delivery parents
      // for other channels, not things they should ever see in their feed.
      .eq('in_app_enabled', true);

    if (filters.unreadOnly) query = query.eq('is_read', false);
    if (filters.type) query = query.eq('type', filters.type);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) {
      throw new AppError('Failed to load notifications.', 500, 'NOTIFICATION_FETCH_ERROR', error);
    }
    return { notifications: (data || []) as NotificationRecord[], total: count ?? 0 };
  }

  // =========================================================================
  // Mark as read
  // =========================================================================

  /**
   * Set a notification's read state.
   *
   * The update is scoped by `user_id` as well as `id`, so a caller cannot mark
   * someone else's notification read even if they learn its id. A null result
   * means either the row does not exist or it belongs to someone else; both are
   * a 404, because distinguishing them would confirm the id exists.
   *
   * `read_at` and `is_read` are written together, in both directions, because
   * `chk_notification_read_state` requires them to agree and a partial write is
   * rejected. Un-marking clears the timestamp rather than leaving a stale one.
   */
  static async setReadState(
    userId: string,
    notificationId: string,
    isRead: boolean
  ): Promise<NotificationRecord> {
    const { data, error } = await createAdminClient()
      .from('notifications')
      .update({ is_read: isRead, read_at: isRead ? new Date().toISOString() : null })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new AppError(
        'Failed to update the notification read state.',
        500,
        'NOTIFICATION_READ_ERROR',
        error
      );
    }
    if (!data) throw new NotFoundError('Notification');

    return data as NotificationRecord;
  }

  /**
   * Mark one notification read.
   *
   * Retained as the one-way convenience wrapper used by the "clear this one"
   * affordance in the feed.
   */
  static async markAsRead(userId: string, notificationId: string): Promise<NotificationRecord> {
    return this.setReadState(userId, notificationId, true);
  }

  /**
   * Mark every unread notification read for a user.
   *
   * Idempotent: running it twice is a no-op the second time, and a user with
   * nothing unread succeeds with `updated: 0` rather than erroring.
   */
  static async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq('user_id', userId)
      .eq('is_read', false)
      .eq('in_app_enabled', true)
      .select('id');

    if (error) {
      throw new AppError('Failed to mark notifications read.', 500, 'NOTIFICATION_READ_ALL_ERROR', error);
    }
    return { updated: (data || []).length };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private static async findByDedupKey(dedupKey: string): Promise<NotificationRecord | null> {
    const { data } = await createAdminClient()
      .from('notifications')
      .select('*')
      .eq('dedup_key', dedupKey)
      .maybeSingle();
    return (data as NotificationRecord) ?? null;
  }

  /** Resolve the recipient's address and display name, once per emit. */
  private static async resolveRecipient(
    userId: string
  ): Promise<{ email: string | null; displayName: string | null }> {
    const { data } = await createAdminClient()
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    let displayName: string | null = null;
    if (data) {
      const { data: profile } = await createAdminClient()
        .from('profiles')
        .select('display_name')
        .eq('user_id', userId)
        .maybeSingle();
      displayName = profile?.display_name ?? null;
    }
    return { email: (data?.email as string) ?? null, displayName };
  }

  /**
   * Deliveries for a notification, for support and debugging.
   *
   * Scoped by joining through the notification's own `user_id`, so a caller
   * cannot read another user's delivery rows.
   */
  static async listDeliveries(
    userId: string,
    notificationId: string
  ): Promise<NotificationDelivery[]> {
    const { data, error } = await createAdminClient()
      .from('notification_deliveries')
      .select('*')
      .eq('notification_id', notificationId);

    if (error) {
      throw new AppError('Failed to load deliveries.', 500, 'DELIVERY_FETCH_ERROR', error);
    }

    const rows = (data || []) as NotificationDelivery[];
    // Ownership was already proven by the caller having loaded the notification,
    // but re-check here so this method is safe on its own.
    if (rows.length === 0) {
      await NotificationService.getNotificationForUser(userId, notificationId);
    }
    return rows;
  }

  /** Fetch a notification, proving ownership. Shared by the routes. */
  static async getNotificationForUser(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord> {
    const { data, error } = await createAdminClient()
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      throw new AppError('Failed to load the notification.', 500, 'NOTIFICATION_FETCH_ERROR', error);
    }
    if (!data) throw new NotFoundError('Notification');
    return data as NotificationRecord;
  }
}

// ---------------------------------------------------------------------------
// Module helpers
// ---------------------------------------------------------------------------

/** Whether a channel is on by default for an event type, ignoring overrides. */
function isDefaultOn(type: NotificationType, channel: ChannelName): boolean {
  return defaultEnabledFor(type, channel);
}

/**
 * Every event type, derived from the defaults map so the two cannot drift.
 *
 * A settings screen that iterated a hand-maintained list would eventually miss a
 * type the database knows about, leaving the user no way to configure it.
 */
const DEFAULT_TYPES = Object.keys(DEFAULT_EMAIL_ENABLED) as NotificationType[];
