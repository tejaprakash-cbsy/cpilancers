/**
 * In-app channel.
 *
 * Writes the durable record. The `notifications` row is written by
 * `NotificationService` itself before any channel runs, because the row is the
 * authoritative record and the unread badge counts it; this channel therefore only
 * has to confirm that the record exists and report it as delivered.
 *
 * Keeping it a channel at all, rather than a special case in the service, is what
 * keeps the fan-out honest: `in_app` obeys the same preference lookup, the same
 * delivery ledger and the same per-channel uniqueness as email, so a bug in one
 * cannot silently skip the other.
 */

import type {
  ChannelDeliveryContext,
  DeliveryOutcome,
  NotificationChannel,
} from '../types';

export const inAppChannel: NotificationChannel = {
  name: 'in_app',

  isConfigured() {
    // The in-app feed is the product. It is always available; there is no key to
    // configure and no external dependency.
    return true;
  },

  async deliver(context: ChannelDeliveryContext): Promise<DeliveryOutcome> {
    if (!context.notificationId) {
      return { status: 'failed', error: 'In-app delivery has no notification row to point at.' };
    }
    // The row was written before the fan-out, so reaching here means the durable
    // record is in place. The notification id is reported as the provider message
    // id so the delivery ledger and the notification can be joined without a
    // special case.
    return { status: 'sent', providerMessageId: context.notificationId };
  },
};
