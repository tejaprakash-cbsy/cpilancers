/**
 * Channel registry — the extension point for new channels.
 *
 * Adding SMS, push or a webhook means: implement `NotificationChannel`, add it to
 * `ALL_CHANNELS`, and add its default to `defaults.ts`. No database migration is
 * needed, because `notification_deliveries.channel` is TEXT rather than an enum
 * precisely so this list can grow without a schema change.
 *
 * The order here is the delivery order. `in_app` is first because it is the
 * authoritative record and the badge the user watches, and the durable write
 * already happened by the time the fan-out runs; email follows because it is
 * slower and more likely to fail, and its failure must never delay or block the
 * in-app notification.
 */

import { inAppChannel } from './in-app';
import { emailChannel } from './email';
import type { ChannelName, NotificationChannel } from '../types';

export const ALL_CHANNELS: readonly NotificationChannel[] = [inAppChannel, emailChannel];

const byName = new Map<string, NotificationChannel>(ALL_CHANNELS.map((c) => [c.name, c]));

/** Look a channel up by name. Returns undefined for an unregistered channel. */
export function getChannel(name: ChannelName): NotificationChannel | undefined {
  return byName.get(String(name));
}

/** Every registered channel name, for rendering a preferences screen. */
export function registeredChannelNames(): ChannelName[] {
  return ALL_CHANNELS.map((c) => c.name);
}

/**
 * Channels actually able to deliver right now.
 *
 * A channel with no credentials is excluded rather than attempted, so an
 * unconfigured provider is a filtered-out channel and not a failed delivery that
 * needs retrying.
 */
export function availableChannels(): NotificationChannel[] {
  return ALL_CHANNELS.filter((c) => c.isConfigured());
}

export { inAppChannel, emailChannel };
