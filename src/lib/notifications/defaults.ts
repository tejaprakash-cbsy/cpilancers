/**
 * Default notification preferences.
 *
 * The database stores only *explicit* overrides, so these defaults are the single
 * source of truth for what a user gets before they touch a setting. Changing a
 * default is a code change, not a migration, and it does not require rewriting
 * existing preference rows.
 *
 * Two separate concerns are modelled here, and conflating them is the usual way a
 * notification system goes wrong:
 *
 *   1. Default channel behaviour per event. A dispute email is worth sending; an
 *      email for every chat message is spam. Users should not have to configure
 *      their way out of noise, and a marketplace that emails every incoming
 *      message will be muted.
 *
 *   2. Essential events. Some notifications are about the user's money, their
 *      reputation or their account security. Those stay in-app no matter what the
 *      preference says, in the same spirit as a platform's mandatory security
 *      alerts. Email can still be turned off for them, because the in-app record
 *      is authoritative; what cannot be turned off is the in-app notice itself.
 */

import type { ChannelName, NotificationType } from './types';
import { CHANNEL_EMAIL, CHANNEL_IN_APP } from './types';

/**
 * Email defaults, per event.
 *
 * On  = an event the user is genuinely waiting for, and that has financial,
 *       contractual or reputational consequence.
 * Off = high-volume or already-surfaced elsewhere, where an email would be noise.
 *
 * `message_received` is off by default because messaging has its own unread
 * system (see `get_unread_message_count` from migration 00001); emailing every
 * message would duplicate a surface the user already watches.
 */
export const DEFAULT_EMAIL_ENABLED: Record<NotificationType, boolean> = {
  // A consultant receives these in volume and will check their dashboard; an
  // email per inbound proposal is how a transactional sender gets filtered.
  proposal_received: false,
  proposal_shortlisted: true,
  // A decision about their work or their hire. Always worth an email.
  proposal_accepted: true,
  proposal_rejected: true,

  contract_created: true,
  contract_accepted: true,
  contract_completed: true,

  // Milestone creation is visible to both parties in the contract view already.
  milestone_created: false,
  // A submission is a call to action; an approval releases the consultant's money.
  milestone_submitted: true,
  milestone_approved: true,
  milestone_revision: true,

  // Money.
  payment_escrowed: true,
  payment_failed: true,
  payment_released: true,

  // Already surfaced by the messaging unread badge.
  message_received: false,

  // Reputation is visible on the profile, but people want to know promptly.
  review_submitted: true,

  dispute_opened: true,
  dispute_resolved: true,
  system_alert: true,
};

/**
 * In-app defaults. Effectively always on: the in-app feed is the product's
 * primary surface and is what the unread badge counts.
 */
export const DEFAULT_IN_APP_ENABLED: Record<NotificationType, boolean> = Object.fromEntries(
  (Object.keys(DEFAULT_EMAIL_ENABLED) as NotificationType[]).map((type) => [type, true])
) as Record<NotificationType, boolean>;

/**
 * Events whose in-app notification is always delivered, regardless of the user's
 * preference.
 *
 * Each of these concerns money the user is owed, their standing on the
 * marketplace, or the security of their account. Suppressing them entirely would
 * let a mis-click hide an escrow notice or a dispute, so the preference applies to
 * email only and the in-app record is guaranteed to exist.
 */
export const ESSENTIAL_IN_APP_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'payment_escrowed',
  'payment_failed',
  'payment_released',
  'dispute_opened',
  'dispute_resolved',
  'contract_created',
  'contract_completed',
  'review_submitted',
  'system_alert',
]);

/** The default enablement of a channel for an event, ignoring user overrides. */
export function defaultEnabledFor(type: NotificationType, channel: ChannelName): boolean {
  // An essential event is always on in-app, whatever the default says.
  if (channel === CHANNEL_IN_APP) {
    return ESSENTIAL_IN_APP_TYPES.has(type) || (DEFAULT_IN_APP_ENABLED[type] ?? false);
  }
  if (channel === CHANNEL_EMAIL) return DEFAULT_EMAIL_ENABLED[type] ?? false;
  // A channel this build does not know about defaults OFF. Without this branch a
  // newly registered channel would inherit the in-app default of `true` and
  // immediately notify every existing user, which is the opposite of the
  // opt-in behaviour a new channel needs.
  return false;
}

/** Whether this event type can be switched off for in-app delivery at all. */
export function isInAppLocked(type: NotificationType): boolean {
  return ESSENTIAL_IN_APP_TYPES.has(type);
}
