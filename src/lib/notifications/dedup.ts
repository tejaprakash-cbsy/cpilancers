/**
 * Deterministic dedup keys.
 *
 * The Stage 12 brief requires that a user is never notified twice for the same
 * event. Application-level "check then insert" cannot deliver that: two
 * concurrent handlers both observe no row and both insert, and a retried request
 * or a redelivered webhook repeats the whole path.
 *
 * The key is therefore derived from the identity of the event, and the database
 * enforces it with a partial unique index on `notifications.dedup_key`. A second
 * writer for the same event computes the same string, loses the index, and is
 * told so with SQLSTATE 23505 — which for a notification is the correct outcome,
 * because "already notified" and "just notified" leave the user in the same
 * state.
 *
 * What this must never contain: a timestamp, a random value, or anything derived
 * from the render. A key that varies between two deliveries of the same event
 * provides no protection at all, and is worse than none because it looks like a
 * safeguard.
 */

/**
 * Build the canonical key for an event.
 *
 * The shape is `<type>:<entity>:<recipient>`, because "the same event" means three
 * things at once: the same kind of thing happened, to the same entity, for the
 * same person. Dropping any component widens the collision — without the recipient,
 * two different users receiving the same proposal would collide; without the
 * entity, a user's tenth proposal would collide with their first.
 *
 * Parts are lowercased and stripped of separators so that no component can forge
 * the boundary between two segments, which would let a crafted entity id alias one
 * event onto another's key.
 */
export function buildDedupKey(params: {
  type: string;
  entityId?: string | null;
  recipientId: string;
}): string | null {
  const { type, entityId, recipientId } = params;

  if (!type || !recipientId) return null;
  // No entity identity means there is nothing stable to deduplicate against, so
  // the notification is deliberately non-deduplicated (a system alert, an admin
  // broadcast). Returning null makes that explicit rather than producing a key
  // that silently collides.
  if (!entityId) return null;

  return `${sanitize(type)}:${sanitize(entityId)}:${sanitize(recipientId)}`;
}

/**
 * Reduce a component to a safe token.
 *
 * Colons and whitespace are stripped so a component cannot introduce a new
 * segment; case is folded because UUIDs and enum values are compared
 * case-insensitively elsewhere and a key that differed only by case would fail to
 * deduplicate two genuinely identical events.
 */
function sanitize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s:]+/g, '-');
}

/**
 * Whether a dedup conflict should be treated as success.
 *
 * 23505 on `uq_notifications_dedup_key` means the event has already been
 * delivered. That is the desired end state, so the caller swallows it and returns
 * the existing notification rather than surfacing an error to the business logic
 * that triggered the event.
 */
export const DEDUP_VIOLATION_CODE = '23505';

export function isDedupViolation(error: { code?: string } | null): boolean {
  return error?.code === DEDUP_VIOLATION_CODE;
}
