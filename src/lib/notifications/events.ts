/**
 * Typed notification event builders.
 *
 * One function per domain event, so a call site reads as a single intent and the
 * title, body, link and template metadata for an event live in exactly one place.
 * The alternative — each service composing its own title and body — is how two
 * parts of a product end up describing the same event in different words, and how
 * a template's metadata keys drift from what the emitter sends.
 *
 * Every builder is responsible for supplying:
 *   - `entityId`, so the dedup key is stable and a retry does not duplicate;
 *   - `actorUserId` / `actorName`, so an email can attribute the event;
 *   - `metadata`, the values the email templates interpolate.
 *
 * None of them accept a rendered title or body from the caller: the content is
 * composed here, from the event's own identity, and never from caller input. That
 * is what stops a notification becoming a free-text channel through which one
 * user can address another.
 */

import { NotificationService } from '@/services/notification.service';
import type { NotificationType } from './types';

/**
 * The emit function these builders call.
 *
 * Injected rather than imported so a builder is trivially testable against a
 * stub. Callers must pass `NotificationService.emitEvent`, not
 * `NotificationService.emit`: the latter is a static method that uses `this`, and
 * an unbound reference throws. `emitEvent` is a bound arrow wrapper around it.
 */
type Emit = typeof NotificationService.emit;

export interface EventActors {
  /** The user the notification is addressed to. */
  recipientUserId: string;
  /** The user who caused the event, when there is one. */
  actorUserId?: string | null;
  actorName?: string | null;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

/** A consultant submitted a proposal. Addressed to the job's owner. */
export async function proposalReceived(
  emit: Emit,
  input: EventActors & { proposalId: string; jobId: string; jobTitle: string }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'proposal_received',
    title: 'New proposal received',
    body: `${input.actorName || 'A consultant'} submitted a proposal on ${input.jobTitle}.`,
    actionUrl: `/jobs/${input.jobId}/proposals`,
    entityType: 'proposal',
    entityId: input.proposalId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { jobTitle: input.jobTitle },
  });
}

export async function proposalShortlisted(
  emit: Emit,
  input: EventActors & { proposalId: string; jobTitle: string }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'proposal_shortlisted',
    title: 'Your proposal was shortlisted',
    body: `Your proposal on ${input.jobTitle} has been shortlisted.`,
    actionUrl: `/proposals/${input.proposalId}`,
    entityType: 'proposal',
    entityId: input.proposalId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { jobTitle: input.jobTitle },
  });
}

export async function proposalAccepted(
  emit: Emit,
  input: EventActors & { proposalId: string; jobTitle: string }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'proposal_accepted',
    title: 'Your proposal was accepted',
    body: `Your proposal on ${input.jobTitle} was accepted. A contract is being prepared.`,
    actionUrl: `/proposals/${input.proposalId}`,
    entityType: 'proposal',
    entityId: input.proposalId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { jobTitle: input.jobTitle },
  });
}

/**
 * A proposal was rejected.
 *
 * The entity is the proposal, so the dedup key is stable across retries. Note
 * that a proposal can only reach `rejected` once, because it is a terminal state
 * in the proposal machine.
 */
export async function proposalRejected(
  emit: Emit,
  input: EventActors & { proposalId: string; jobTitle: string }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'proposal_rejected',
    title: 'Update on your proposal',
    body: `Your proposal on ${input.jobTitle} was not selected this time.`,
    actionUrl: `/proposals/${input.proposalId}`,
    entityType: 'proposal',
    entityId: input.proposalId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { jobTitle: input.jobTitle },
  });
}

// ---------------------------------------------------------------------------
// Contracts and milestones
// ---------------------------------------------------------------------------

export async function contractCreated(
  emit: Emit,
  input: EventActors & { contractId: string; contractTitle: string }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'contract_created',
    title: 'A contract is ready for you to review',
    body: `A contract has been created for ${input.contractTitle}. Review the scope and milestones before it becomes active.`,
    actionUrl: `/contracts/${input.contractId}`,
    entityType: 'contract',
    entityId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { contractTitle: input.contractTitle },
  });
}

export async function contractCompleted(
  emit: Emit,
  input: EventActors & { contractId: string; contractTitle: string }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'contract_completed',
    title: 'Contract completed',
    body: `${input.contractTitle} has been marked complete. You can now leave a review.`,
    actionUrl: `/contracts/${input.contractId}/review`,
    entityType: 'contract',
    entityId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { contractTitle: input.contractTitle },
  });
}

export async function milestoneCreated(
  emit: Emit,
  input: EventActors & {
    milestoneId: string;
    milestoneTitle: string;
    contractId: string;
    contractTitle: string;
  }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'milestone_created',
    title: `New milestone: ${input.milestoneTitle}`,
    body: `A milestone was added to ${input.contractTitle}.`,
    actionUrl: `/contracts/${input.contractId}/milestones/${input.milestoneId}`,
    entityType: 'milestone',
    entityId: input.milestoneId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: {
      milestoneTitle: input.milestoneTitle,
      contractTitle: input.contractTitle,
    },
  });
}

/**
 * A deliverable was submitted. Addressed to the client, who must review it.
 *
 * `submissionId` identifies the individual SUBMISSION, not the milestone, and is
 * required rather than optional. The Stage 9 state machine permits
 * `disputed -> submitted`, so a milestone can legitimately be submitted more than
 * once; keying on the milestone alone made the second submission a silent
 * duplicate and the client was never told. The caller supplies the transition's
 * `submitted_at` as the occurrence id, which is stable for a given submission
 * (so a reprocessed transition still dedupes) and different for each one.
 */
export async function milestoneSubmitted(
  emit: Emit,
  input: EventActors & {
    milestoneId: string;
    submissionId: string;
    milestoneTitle: string;
    contractId: string;
  }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'milestone_submitted',
    title: `Deliverable submitted: ${input.milestoneTitle}`,
    body: `${input.actorName || 'The consultant'} submitted the deliverable. Review and approve it to release payment.`,
    actionUrl: `/contracts/${input.contractId}/milestones/${input.milestoneId}`,
    entityType: 'milestone',
    entityId: `${input.milestoneId}@${input.submissionId}`,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { milestoneTitle: input.milestoneTitle },
  });
}

export async function milestoneApproved(
  emit: Emit,
  input: EventActors & {
    milestoneId: string;
    milestoneTitle: string;
    contractId: string;
  }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'milestone_approved',
    title: `Milestone approved: ${input.milestoneTitle}`,
    body: 'The milestone was approved. Escrowed funds can now be released.',
    actionUrl: `/contracts/${input.contractId}/milestones/${input.milestoneId}`,
    entityType: 'milestone',
    entityId: input.milestoneId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { milestoneTitle: input.milestoneTitle },
  });
}

export async function milestoneRevisionRequested(
  emit: Emit,
  input: EventActors & {
    milestoneId: string;
    milestoneTitle: string;
    contractId: string;
    notes?: string | null;
  }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'milestone_revision',
    title: `Changes requested: ${input.milestoneTitle}`,
    body: 'Changes were requested on a milestone you submitted.',
    actionUrl: `/contracts/${input.contractId}/milestones/${input.milestoneId}`,
    entityType: 'milestone',
    entityId: input.milestoneId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { milestoneTitle: input.milestoneTitle, notes: input.notes ?? null },
  });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** Funds captured and held in escrow. Addressed to the consultant. */
export async function paymentEscrowed(
  emit: Emit,
  input: EventActors & { paymentId: string; amountFormatted: string; milestoneTitle?: string | null }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'payment_escrowed',
    title: 'Payment received and held in escrow',
    body: `${input.amountFormatted} has been received and is held in escrow. It is released when the milestone is approved.`,
    actionUrl: `/payments/${input.paymentId}`,
    entityType: 'payment',
    entityId: input.paymentId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: {
      amountFormatted: input.amountFormatted,
      milestoneTitle: input.milestoneTitle ?? null,
    },
  });
}

/**
 * A payment failed.
 *
 * Addressed to the payer, who is the only party who can act on it. This is one of
 * the four event types Stage 1's enum could not express.
 */
export async function paymentFailed(
  emit: Emit,
  input: EventActors & {
    paymentId: string;
    amountFormatted: string;
    reason?: string | null;
  }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'payment_failed',
    title: 'Payment failed',
    body: `Your payment of ${input.amountFormatted} could not be completed. No funds have been taken.`,
    actionUrl: `/payments/${input.paymentId}`,
    entityType: 'payment',
    entityId: input.paymentId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { amountFormatted: input.amountFormatted, reason: input.reason ?? null },
  });
}

/** Escrow released and settling to the consultant's bank. */
export async function paymentReleased(
  emit: Emit,
  input: EventActors & { paymentId: string; amountFormatted: string; milestoneTitle?: string | null }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'payment_released',
    title: `Payment released: ${input.amountFormatted}`,
    body: `${input.amountFormatted} has been released and is settling to your bank account.`,
    actionUrl: `/payments/${input.paymentId}`,
    entityType: 'payment',
    entityId: input.paymentId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: {
      amountFormatted: input.amountFormatted,
      milestoneTitle: input.milestoneTitle ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Messaging, reviews, disputes
// ---------------------------------------------------------------------------

/**
 * A message was sent. Addressed to every other conversation participant.
 *
 * The event identity is the MESSAGE, not the conversation. A conversation is
 * long-lived: keying on `conversationId` made the dedup key constant for the life
 * of the thread, so the first message notified and every subsequent one was
 * silently swallowed by the unique index. Keying on `messageId` gives the
 * intended behaviour — one notification per message, and still exactly one when
 * the same message is processed twice.
 *
 * `conversationId` is retained for the link and the display metadata, because
 * that is what a recipient needs to act on the notification.
 */
export async function messageReceived(
  emit: Emit,
  input: EventActors & {
    messageId: string;
    conversationId: string;
    conversationTitle?: string | null;
  }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'message_received',
    title: 'New message received',
    body: `${input.actorName || 'Someone'} sent you a message.`,
    actionUrl: `/messages/${input.conversationId}`,
    entityType: 'message',
    entityId: input.messageId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { conversationTitle: input.conversationTitle ?? null },
  });
}

export async function reviewSubmitted(
  emit: Emit,
  input: EventActors & { reviewId: string; rating: number; contractId: string }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'review_submitted',
    title: 'You received a new review',
    body: `${input.actorName || 'A counterparty'} left you a ${input.rating}-star review.`,
    actionUrl: `/reputation/${input.recipientUserId}`,
    entityType: 'review',
    entityId: input.reviewId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: { rating: input.rating, contractId: input.contractId },
  });
}

/**
 * A dispute was opened.
 *
 * Addressed to the respondent, i.e. the counterparty of whoever opened it.
 *
 * DEDUP IDENTITY, and why `contractId` is a correct one rather than a placeholder.
 * The concern with keying on the contract is that it would merge two genuinely
 * distinct dispute events into one notification. That cannot happen in this domain,
 * and the state machine is what guarantees it:
 *
 *   CONTRACT_TRANSITIONS (src/lib/validations/contract.schemas.ts) allows a
 *   contract to enter `disputed` only from `active`, and allows `disputed` to
 *   reach only `completed`, `cancelled` or `terminated` - all three terminal. There
 *   is no path from `disputed` back to `active`, so a given contract can be
 *   disputed AT MOST ONCE in the lifetime of the contract. One contract therefore
 *   carries at most one dispute-open event, and the contract is a faithful identity
 *   for it.
 *
 * This is deliberately NOT relying on the absence of a second dispute flow: if a
 * `disputes` creation path is ever added, or the state machine is widened to allow
 * a contract to leave and re-enter dispute, this key must tighten to the dispute
 * row's own id in the same commit. `src/tests/notification-dedup.test.ts` asserts
 * the terminal-transition property so that change cannot pass silently.
 *
 * `disputeId` is accepted so that a dispute-creation flow can tighten the key
 * without touching this signature, and it takes precedence when supplied. Today
 * nothing in the application inserts a dispute row, so callers omit it.
 */
export async function disputeOpened(
  emit: Emit,
  input: EventActors & {
    contractId: string;
    contractTitle?: string | null;
    reason?: string | null;
    disputeId?: string | null;
  }
) {
  return emit({
    userId: input.recipientUserId,
    type: 'dispute_opened',
    title: 'A dispute has been opened',
    body: 'A dispute was opened on your contract. Escrowed funds are held while this is resolved.',
    actionUrl: input.disputeId
      ? `/contracts/${input.contractId}/disputes/${input.disputeId}`
      : `/contracts/${input.contractId}`,
    entityType: 'dispute',
    entityId: input.disputeId ?? `contract:${input.contractId}`,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    metadata: {
      contractTitle: input.contractTitle ?? null,
      reason: input.reason ?? null,
    },
  });
}

/** Every builder, for tests and for a future outbox replay. */
export const NOTIFICATION_EVENTS = {
  proposalReceived,
  proposalShortlisted,
  proposalAccepted,
  proposalRejected,
  contractCreated,
  contractCompleted,
  milestoneCreated,
  milestoneSubmitted,
  milestoneApproved,
  milestoneRevisionRequested,
  paymentEscrowed,
  paymentFailed,
  paymentReleased,
  messageReceived,
  reviewSubmitted,
  disputeOpened,
} satisfies Record<string, (emit: Emit, input: never) => Promise<unknown>>;

/** The fourteen event types the Stage 12 brief requires, and where each is emitted. */
export const REQUIRED_EVENT_COVERAGE: Record<
  string,
  { type: NotificationType; builder: keyof typeof NOTIFICATION_EVENTS }
> = {
  'new proposal': { type: 'proposal_received', builder: 'proposalReceived' },
  'proposal accepted': { type: 'proposal_accepted', builder: 'proposalAccepted' },
  'proposal rejected': { type: 'proposal_rejected', builder: 'proposalRejected' },
  'new message': { type: 'message_received', builder: 'messageReceived' },
  'contract created': { type: 'contract_created', builder: 'contractCreated' },
  'milestone created': { type: 'milestone_created', builder: 'milestoneCreated' },
  'milestone submitted': { type: 'milestone_submitted', builder: 'milestoneSubmitted' },
  'milestone approved': { type: 'milestone_approved', builder: 'milestoneApproved' },
  'payment successful': { type: 'payment_escrowed', builder: 'paymentEscrowed' },
  'payment failed': { type: 'payment_failed', builder: 'paymentFailed' },
  'payout processed': { type: 'payment_released', builder: 'paymentReleased' },
  'contract completed': { type: 'contract_completed', builder: 'contractCompleted' },
  'new review': { type: 'review_submitted', builder: 'reviewSubmitted' },
  'dispute opened': { type: 'dispute_opened', builder: 'disputeOpened' },
};
