import { createAdminClient } from '@/lib/supabase/admin';
import { BaseService } from './base.service';
import type { Contract, ContractStatus, Milestone, MilestoneStatus } from '@/types/database';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { CONTRACT_TRANSITIONS, MILESTONE_TRANSITIONS } from '@/lib/validations/contract.schemas';
import { NotificationService } from '@/services/notification.service';
import {
  contractCompleted,
  contractCreated,
  disputeOpened,
  milestoneApproved,
  milestoneCreated,
  milestoneSubmitted,
} from '@/lib/notifications/events';

export interface CreateContractData {
  proposal_id: string;
  title: string;
  terms_markdown: string;
  contract_type: 'fixed_price' | 'hourly';
  total_amount_cents?: number;
  start_date?: string;
  end_date?: string;
}

type Participant = { isClient: boolean; isConsultant: boolean };

export class ContractService extends BaseService {
  private static async participant(contract: any, userId: string): Promise<Participant> {
    const db = createAdminClient();
    const [{ data: client }, { data: consultant }] = await Promise.all([
      db.from('client_profiles').select('user_id').eq('id', contract.client_id).single(),
      db.from('consultant_profiles').select('user_id').eq('id', contract.consultant_id).single(),
    ]);
    return { isClient: client?.user_id === userId, isConsultant: consultant?.user_id === userId };
  }

  private static async getRaw(id: string) {
    const { data, error } = await createAdminClient().from('contracts').select('*').eq('id', id).single();
    if (error || !data) throw new NotFoundError('Contract');
    return data;
  }

  static async createContract(clientUserId: string, input: CreateContractData): Promise<Contract> {
    try {
      const db = createAdminClient();
      const { data: proposal } = await db.from('proposals').select('proposed_price_cents').eq('id', input.proposal_id).single();
      if (!proposal) throw new NotFoundError('Proposal');
      const type = input.contract_type;
      const total = input.total_amount_cents ?? proposal.proposed_price_cents;
      if (!Number.isInteger(total) || total <= 0) throw new ValidationError('A positive total amount is required.');
      const { data: contract, error } = await db.rpc('create_contract_for_proposal', {
        p_client_user_id: clientUserId,
        p_proposal_id: input.proposal_id,
        p_title: input.title,
        p_terms_markdown: input.terms_markdown,
        p_contract_type: type,
        p_total_amount_cents: total,
        p_start_date: input.start_date || null,
        p_end_date: input.end_date || null,
      });
      if (error || !contract) throw new AppError('Failed to create contract.', 500, 'DB_INSERT_ERROR', error);
      await this.notifyContractCreated(contract as Contract, clientUserId);
      return contract as Contract;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ContractService.createContract');
    }
  }

  /**
   * Tell the consultant a contract is ready for them to review.
   *
   * The contract is created by the client, so the consultant is the party who
   * needs to act. The recipient is resolved from the contract's own
   * `consultant_id` → profile, never from the caller. Swallowed on failure: the
   * contract already exists and a failed email must not undo it.
   */
  private static async notifyContractCreated(
    contract: Contract,
    actorUserId: string
  ): Promise<void> {
    try {
      const db = createAdminClient();
      const { data: consultant } = await db
        .from('consultant_profiles')
        .select('user_id')
        .eq('id', contract.consultant_id)
        .maybeSingle();
      if (!consultant?.user_id) return;

      const { data: actorProfile } = await db
        .from('profiles')
        .select('display_name')
        .eq('user_id', actorUserId)
        .maybeSingle();

      await contractCreated(NotificationService.emitEvent, {
        recipientUserId: String(consultant.user_id),
        actorUserId,
        actorName: actorProfile?.display_name ?? null,
        contractId: contract.id,
        contractTitle: contract.title,
      });
    } catch (error) {
      console.error('[ContractService] failed to send contract-created notification:', error);
    }
  }

  /**
   * Tell the counterparty a milestone was added.
   *
   * Milestones are added by the client, so the consultant is the party who needs
   * to know. Email is off for this event by default (both parties can already see
   * it in the contract view), so in practice this is an in-app notice.
   */
  private static async notifyMilestoneCreated(
    milestone: Milestone,
    contract: { title?: string },
    actorUserId: string
  ): Promise<void> {
    try {
      const db = createAdminClient();
      const full = await this.getRaw(milestone.contract_id);
      const { data: consultant } = await db
        .from('consultant_profiles')
        .select('user_id')
        .eq('id', full.consultant_id)
        .maybeSingle();
      if (!consultant?.user_id) return;

      const { data: actorProfile } = await db
        .from('profiles')
        .select('display_name')
        .eq('user_id', actorUserId)
        .maybeSingle();

      await milestoneCreated(NotificationService.emitEvent, {
        recipientUserId: String(consultant.user_id),
        actorUserId,
        actorName: actorProfile?.display_name ?? null,
        milestoneId: milestone.id,
        milestoneTitle: milestone.title,
        contractId: milestone.contract_id,
        contractTitle: contract.title ?? full.title ?? 'your contract',
      });
    } catch (error) {
      console.error('[ContractService] failed to send milestone-created notification:', error);
    }
  }

  /**
   * Tell the counterparty that a dispute has been opened against the contract.
   *
   * A contract entering `disputed` is the authoritative moment a dispute begins:
   * the `disputes` table exists and Stage 13's admin service can list and resolve
   * disputes, but nothing in the application inserts a dispute row yet, so there
   * is no dispute id to key on and the contract is used as the event identity.
   *
   * Only the respondent is told, so the person opening the dispute is not
   * notified about their own action.
   */
  private static async notifyDisputeOpened(
    contract: Contract,
    actorUserId: string
  ): Promise<void> {
    try {
      const db = createAdminClient();
      const { data: actor } = await db
        .from('client_profiles')
        .select('user_id')
        .eq('id', contract.client_id)
        .maybeSingle();
      // Whoever is not the client is the counterparty here, and the actor is
      // either the client or the consultant, so the counterparty is resolved by
      // elimination from the two known parties.
      const respondentUserId =
        actor?.user_id === actorUserId
          ? (
              await db
                .from('consultant_profiles')
                .select('user_id')
                .eq('id', contract.consultant_id)
                .maybeSingle()
            ).data?.user_id
          : actor?.user_id;
      if (!respondentUserId) return;

      const { data: actorProfile } = await db
        .from('profiles')
        .select('display_name')
        .eq('user_id', actorUserId)
        .maybeSingle();

      await disputeOpened(NotificationService.emitEvent, {
        recipientUserId: String(respondentUserId),
        actorUserId,
        actorName: actorProfile?.display_name ?? null,
        contractId: contract.id,
        contractTitle: contract.title,
      });
    } catch (error) {
      console.error('[ContractService] failed to send dispute-opened notification:', error);
    }
  }

  static async getContract(id: string, userId: string): Promise<Contract> {
    const contract = await this.getRaw(id);
    const actor = await this.participant(contract, userId);
    if (!actor.isClient && !actor.isConsultant) throw new ForbiddenError('You do not have access to this contract.');
    return contract as Contract;
  }

  static async listContracts(userId: string): Promise<Contract[]> {
    const db = createAdminClient();
    const [{ data: client }, { data: consultant }] = await Promise.all([
      db.from('client_profiles').select('id').eq('user_id', userId).maybeSingle(),
      db.from('consultant_profiles').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    let query = db.from('contracts').select('*').order('created_at', { ascending: false });
    if (client?.id) query = query.eq('client_id', client.id);
    else if (consultant?.id) query = query.eq('consultant_id', consultant.id);
    else return [];
    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch contracts.', 500, 'DB_FETCH_ERROR', error);
    return (data || []) as Contract[];
  }

  static async transitionContract(id: string, userId: string, next: ContractStatus): Promise<Contract> {
    const db = createAdminClient();
    const contract = await this.getRaw(id);
    const actor = await this.participant(contract, userId);
    if (!actor.isClient && !actor.isConsultant) throw new ForbiddenError('You do not have access to this contract.');
    const current = contract.status as ContractStatus;
    if (!CONTRACT_TRANSITIONS[current]?.includes(next)) throw new ConflictError(`Invalid contract transition: ${current} -> ${next}.`);
    const clientOnly = ['active', 'completed', 'cancelled', 'terminated'].includes(next);
    if (clientOnly && !actor.isClient) throw new ForbiddenError('Only the client can perform this contract transition.');
    if (next === 'disputed' && !actor.isClient && !actor.isConsultant) throw new ForbiddenError('Only contract participants can dispute a contract.');
    const payload: any = { status: next, updated_at: new Date().toISOString() };
    if (next === 'active') payload.started_at = new Date().toISOString();
    if (next === 'completed') payload.completed_at = new Date().toISOString();
    if (['cancelled', 'terminated'].includes(next)) payload.cancelled_at = new Date().toISOString();
    const { data, error } = await db.from('contracts').update(payload).eq('id', id).select('*').single();
    if (error || !data) throw new AppError('Failed to transition contract.', 500, 'DB_UPDATE_ERROR', error);

    // On completion both parties are told, because both can now leave a review
    // and only the client can, so the consultant needs the prompt most.
    if (next === 'completed') {
      await this.notifyContractCompleted(data as Contract, userId);
    }

    // Entering `disputed` is the moment a dispute opens: funds are frozen and the
    // counterparty has to be told. The application has no dispute-creation flow
    // yet, so this is anchored to the state change that constitutes one.
    if (next === 'disputed') {
      await this.notifyDisputeOpened(data as Contract, userId);
    }

    return data as Contract;
  }

  /**
   * Announce a completed contract to both participants.
   *
   * Deduped on the contract id, so a retried completion cannot notify twice.
   * Swallowed on failure: the contract is already completed and refusing to
   * complete it because an email failed would be the wrong trade.
   */
  private static async notifyContractCompleted(
    contract: Contract,
    actorUserId: string
  ): Promise<void> {
    try {
      const db = createAdminClient();
      const [{ data: client }, { data: consultant }, { data: actorProfile }] = await Promise.all([
        db.from('client_profiles').select('user_id').eq('id', contract.client_id).single(),
        db.from('consultant_profiles').select('user_id').eq('id', contract.consultant_id).single(),
        db
          .from('profiles')
          .select('display_name')
          .eq('user_id', actorUserId)
          .maybeSingle(),
      ]);

      const emit = NotificationService.emitEvent;
      for (const userId of [client?.user_id, consultant?.user_id]) {
        if (!userId) continue;
        await contractCompleted(emit, {
          recipientUserId: String(userId),
          actorUserId,
          actorName: actorProfile?.display_name ?? null,
          contractId: contract.id,
          contractTitle: contract.title,
        });
      }
    } catch (error) {
      console.error('[ContractService] failed to send contract-completed notification:', error);
    }
  }

  static async createMilestone(userId: string, input: { contract_id: string; title: string; description?: string; amount_cents: number; due_date: string; sequence_order: number }): Promise<Milestone> {
    const db = createAdminClient();
    const contract = await this.getRaw(input.contract_id);
    const actor = await this.participant(contract, userId);
    if (!actor.isClient) throw new ForbiddenError('Only the client can manage contract milestones.');
    if ((contract.contract_type || (contract.payment_structure === 'hourly_capped' ? 'hourly' : 'fixed_price')) !== 'fixed_price') throw new ForbiddenError('Milestones are only available for fixed-price contracts.');
    if (contract.status !== 'pending_acceptance' && contract.status !== 'active') throw new ForbiddenError('Milestones cannot be added to this contract.');
    const { data: milestone, error } = await db.from('milestones').insert({ ...input, description: input.description || '', status: 'pending' }).select('*').single();
    if (error || !milestone) throw new AppError('Failed to create milestone.', 500, 'DB_INSERT_ERROR', error);
    await this.notifyMilestoneCreated(
      milestone as Milestone,
      contract as unknown as { title?: string },
      userId
    );
    return milestone as Milestone;
  }

  static async transitionMilestone(id: string, userId: string, next: MilestoneStatus, note?: string): Promise<Milestone> {
    const db = createAdminClient();
    const { data: milestone } = await db.from('milestones').select('*').eq('id', id).single();
    if (!milestone) throw new NotFoundError('Milestone');
    const contract = await this.getRaw(milestone.contract_id);
    const actor = await this.participant(contract, userId);
    if (!actor.isClient && !actor.isConsultant) throw new ForbiddenError('You do not have access to this milestone.');
    const current = milestone.status as MilestoneStatus;
    if (!MILESTONE_TRANSITIONS[current]?.includes(next)) throw new ConflictError(`Invalid milestone transition: ${current} -> ${next}.`);
    if (next === 'funded' && !actor.isClient) throw new ForbiddenError('Only the client can fund a milestone.');
    if (next === 'in_progress' && !actor.isConsultant) throw new ForbiddenError('Only the assigned consultant can start work.');
    if (next === 'submitted' && !actor.isConsultant) throw new ForbiddenError('Only the assigned consultant can submit deliverables.');
    if (next === 'approved' && !actor.isClient) throw new ForbiddenError('Only the client can approve a milestone.');
    const payload: any = { status: next, updated_at: new Date().toISOString() };
    if (next === 'submitted') { payload.submitted_at = new Date().toISOString(); if (note) payload.deliverable_notes = note; }
    if (next === 'approved') payload.approved_at = new Date().toISOString();
    if (next === 'disputed' && note) payload.revision_notes = note;
    const { data, error } = await db.from('milestones').update(payload).eq('id', id).select('*').single();
    if (error || !data) throw new AppError('Failed to transition milestone.', 500, 'DB_UPDATE_ERROR', error);

    // Notify the counterparty. Routed through NotificationService so it is
    // deduplicated on the milestone id, honours channel preferences, and is
    // recorded in the delivery ledger. Swallowed on failure: the transition is
    // already committed and a failed email must not undo an approval.
    await this.notifyMilestoneTransition(
      data as Milestone,
      contract as unknown as { id: string; title?: string; client_id: string; consultant_id: string },
      next,
      userId,
      note
    );

    return data as Milestone;
  }

  /**
   * Tell the other party that a milestone moved.
   *
   * Only `submitted` and `approved` notify, because those are the two that require
   * the other party to act: a submission is a call to review, and an approval
   * releases the consultant's money. `in_progress` and `funded` are already
   * visible to both parties in the contract view and have their own payment
   * notifications.
   */
  private static async notifyMilestoneTransition(
    milestone: Milestone,
    contract: { id: string; title?: string; client_id: string; consultant_id: string },
    next: MilestoneStatus,
    actorUserId: string,
    note?: string
  ): Promise<void> {
    const isSubmission = next === 'submitted';
    const isApproval = next === 'approved';
    if (!isSubmission && !isApproval) return;

    try {
      // The recipient is the counterparty: the client is told about a submission,
      // the consultant about an approval. Resolved from the contract's profile ids
      // rather than taken from the caller, so a notification cannot be aimed at an
      // arbitrary user.
      const db = createAdminClient();
      const recipientUserId = isSubmission
        ? (await db.from('client_profiles').select('user_id').eq('id', contract.client_id).single())
            .data?.user_id
        : (
            await db
              .from('consultant_profiles')
              .select('user_id')
              .eq('id', contract.consultant_id)
              .single()
          ).data?.user_id;
      if (!recipientUserId) return;

      const { data: actorProfile } = await db
        .from('profiles')
        .select('display_name')
        .eq('user_id', actorUserId)
        .maybeSingle();

      const input = {
        recipientUserId: String(recipientUserId),
        actorUserId,
        actorName: actorProfile?.display_name ?? null,
        milestoneId: milestone.id,
        milestoneTitle: milestone.title,
        contractId: milestone.contract_id,
        ...(isSubmission ? {} : { notes: note ?? null }),
      };

      const emit = NotificationService.emitEvent;
      if (isSubmission) {
        await milestoneSubmitted(emit, {
          ...input,
          // The occurrence id is the transition's own `submitted_at`, which the
          // update above just set. It is stable for this submission, so a
          // reprocessed transition dedupes, and different for a resubmission
          // after a dispute, so that one notifies as it should.
          submissionId: milestone.submitted_at ?? `ts:${Date.now()}`,
        });
      } else {
        await milestoneApproved(emit, input);
      }
    } catch (error) {
      console.error('[ContractService] failed to send milestone notification:', error);
    }
  }

  static async updateMilestone(id: string, userId: string, updates: Record<string, unknown>): Promise<Milestone> {
    const db = createAdminClient();
    const { data: milestone } = await db.from('milestones').select('*').eq('id', id).single();
    if (!milestone) throw new NotFoundError('Milestone');
    const contract = await this.getRaw(milestone.contract_id);
    const actor = await this.participant(contract, userId);
    if (!actor.isClient) throw new ForbiddenError('Only the client can edit milestone terms.');
    if (['funded', 'in_progress', 'submitted', 'approved', 'disputed'].includes(milestone.status)) throw new ForbiddenError('Milestone terms cannot be changed after funding.');
    const { data: payment } = await db.from('payments').select('id').eq('milestone_id', id).in('status', ['held_in_escrow', 'released']).maybeSingle();
    if (payment) throw new ForbiddenError('Milestone amount cannot be changed after funding.');
    const { data, error } = await db.from('milestones').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error || !data) throw new AppError('Failed to update milestone.', 500, 'DB_UPDATE_ERROR', error);
    return data as Milestone;
  }
}
