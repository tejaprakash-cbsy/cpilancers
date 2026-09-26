import { createAdminClient } from '@/lib/supabase/admin';
import { BaseService } from './base.service';
import type { Contract, ContractStatus, Milestone, MilestoneStatus } from '@/types/database';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { CONTRACT_TRANSITIONS, MILESTONE_TRANSITIONS } from '@/lib/validations/contract.schemas';

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
      return contract as Contract;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ContractService.createContract');
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
    return data as Contract;
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
    return data as Milestone;
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
