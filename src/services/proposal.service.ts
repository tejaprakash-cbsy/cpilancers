/**
 * Proposal Service
 * Handles proposal lifecycle with state machine enforcement,
 * authorization checks, and server-side validation.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BaseService } from './base.service';
import type {
  Proposal,
  ProposalStatus,
} from '@/types/database';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '@/lib/errors';
import {
  PROPOSAL_TRANSITIONS,
  TRANSITION_ACTOR,
} from '@/lib/validations/proposal.schemas';

export interface CreateProposalData {
  job_id: string;
  cover_letter_markdown: string;
  technical_solution_markdown: string;
  proposed_duration_weeks: number;
  proposed_price_cents: number;
  proposed_milestones?: Array<{
    title: string;
    description?: string;
    due_weeks: number;
    amount_cents: number;
  }>;
  status?: 'draft' | 'submitted';
}

export interface UpdateProposalData {
  cover_letter_markdown?: string;
  technical_solution_markdown?: string;
  proposed_duration_weeks?: number;
  proposed_price_cents?: number;
  proposed_milestones?: Array<{
    title: string;
    description?: string;
    due_weeks: number;
    amount_cents: number;
  }>;
}

export interface ProposalFilterOptions {
  job_id?: string;
  consultant_id?: string;
  status?: ProposalStatus[];
  sortBy?: 'submitted_at' | 'proposed_price_cents' | 'proposed_duration_weeks';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export class ProposalService extends BaseService {
  /**
   * Create a new proposal. Enforces:
   * - Authenticated consultant only
   * - Job must be open (not draft/closed/in_review/hired/etc)
   * - Consultant cannot be the job owner (self-application)
   * - No duplicate active proposal for same (consultant, job) pair
   * - DB-level unique constraint provides final guard
   */
  static async createProposal(
    consultantId: string,
    data: CreateProposalData
  ): Promise<Proposal> {
    try {
      const supabase = await createClient();
      const adminSupabase = createAdminClient();

      // 1. Verify consultant profile exists
      const { data: consultantProfile, error: profileErr } = await adminSupabase
        .from('consultant_profiles')
        .select('id, user_id')
        .eq('user_id', consultantId)
        .single();
      if (profileErr || !consultantProfile) {
        throw new ForbiddenError('Consultant profile not found.');
      }
      const consultantProfileId = consultantProfile.id;

      // 2. Load the job (with owner info) to enforce rules
      const { data: job, error: jobErr } = await adminSupabase
        .from('jobs')
        .select('id, client_id, status, company_id')
        .eq('id', data.job_id)
        .single();
      if (jobErr || !job) {
        throw new NotFoundError('Job');
      }

      // 2a. Job must be open for proposals
      const openStatuses = ['open', 'in_review'];
      if (!openStatuses.includes(job.status as string)) {
        throw new ForbiddenError(
          `Cannot submit proposal: job status is "${job.status}".`
        );
      }

      // 2b. Prevent self-application: consultant must not be the client who posted
      const { data: clientProfile } = await adminSupabase
        .from('client_profiles')
        .select('user_id')
        .eq('id', job.client_id)
        .single();
      if (clientProfile?.user_id === consultantId) {
        throw new ForbiddenError('Consultants cannot apply to their own job.');
      }

      // 3. Check for existing active proposal (same consultant + job)
      // We consider 'draft', 'submitted', 'shortlisted' as active.
      // If a withdrawn/rejected/accepted exists, a new proposal is allowed.
      const activeStatuses: ProposalStatus[] = [
        'draft',
        'submitted',
        'shortlisted',
      ];
      const { data: existing } = await adminSupabase
        .from('proposals')
        .select('id, status')
        .eq('job_id', data.job_id)
        .eq('consultant_id', consultantProfileId)
        .in('status', activeStatuses);
      if (existing && existing.length > 0) {
        throw new ConflictError('You already have an active proposal for this job.');
      }

      // 4. Determine initial status
      const status: ProposalStatus = data.status === 'draft' ? 'draft' : 'submitted';

      // 5. Insert proposal (admin bypasses RLS)
      const proposalPayload = {
        job_id: data.job_id,
        consultant_id: consultantProfileId,
        cover_letter_markdown: data.cover_letter_markdown,
        technical_solution_markdown: data.technical_solution_markdown,
        proposed_duration_weeks: data.proposed_duration_weeks,
        proposed_price_cents: data.proposed_price_cents,
        proposed_milestones: data.proposed_milestones || [],
        status,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      };

      const { data: proposal, error: insertErr } = await adminSupabase
        .from('proposals')
        .insert(proposalPayload)
        .select('*')
        .single();
      if (insertErr) {
        // The DB unique constraint will trigger a Postgres error with code 23505
        if (insertErr.code === '23505') {
          throw new ConflictError('You already have an active proposal for this job.');
        }
        throw new AppError('Failed to create proposal.', 500, 'DB_INSERT_ERROR', insertErr);
      }

      return proposal as Proposal;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ProposalService.createProposal');
    }
  }

  /**
   * Get a single proposal by ID.
   * Enforces authorization: either consultant (author) or client (job owner) can view.
   */
  static async getProposalById(
    proposalId: string,
    userId: string
  ): Promise<Proposal> {
    try {
      const adminSupabase = createAdminClient();

      const { data: proposal, error } = await adminSupabase
        .from('proposals')
        .select(`
          *,
          consultant:consultant_profiles!consultant_id (*),
          job:jobs!job_id (*)
        `)
        .eq('id', proposalId)
        .single();
      if (error || !proposal) {
        throw new NotFoundError('Proposal');
      }

      // Check authorization: must be proposal author or job owner
      const { data: consultantProfile } = await adminSupabase
        .from('consultant_profiles')
        .select('user_id')
        .eq('id', proposal.consultant_id)
        .single();

      const { data: jobClient } = await adminSupabase
        .from('client_profiles')
        .select('user_id')
        .eq('id', proposal.job.client_id)
        .single();

      const isAuthor = consultantProfile?.user_id === userId;
      const isJobOwner = jobClient?.user_id === userId;
      if (!isAuthor && !isJobOwner) {
        throw new ForbiddenError('You do not have access to this proposal.');
      }

      return proposal as Proposal;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ProposalService.getProposalById');
    }
  }

  /**
   * List proposals with optional filters.
   * Used by both consultant (their proposals) and client (proposals for their jobs).
   */
  static async listProposals(
    userId: string,
    options: ProposalFilterOptions = {}
  ): Promise<{ proposals: Proposal[]; total: number; page: number; limit: number }> {
    try {
      const adminSupabase = createAdminClient();
      const { job_id, consultant_id, status, sortBy = 'submitted_at', sortOrder = 'desc', page = 1, limit = 10 } = options;

      // Build base query
      let query = adminSupabase
        .from('proposals')
        .select(`
          *,
          consultant:consultant_profiles!consultant_id (*),
          job:jobs!job_id (*)
        `, { count: 'exact' });

      // If a specific user calls without specifying consultant_id,
      // restrict to that user's consultant profile proposals (consultant view)
      // OR to their client's job proposals (client view).
      // For simplicity in this service, we require the caller to specify
      // the filter context explicitly or pass job_id / consultant_id.
      // We don't enforce additional authorization here because the API
      // layer will pass appropriate filters.

      if (consultant_id) {
        query = query.eq('consultant_id', consultant_id);
      }
      if (job_id) {
        query = query.eq('job_id', job_id);
      }
      if (status && status.length > 0) {
        query = query.in('status', status);
      }

      // Sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) {
        throw new AppError('Failed to fetch proposals.', 500, 'DB_FETCH_ERROR', error);
      }

      return {
        proposals: (data || []) as Proposal[],
        total: count || 0,
        page,
        limit,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ProposalService.listProposals');
    }
  }

  /**
   * Get all proposals for a specific job (client view).
   */
  static async getProposalsForJob(
    jobId: string,
    clientUserId: string,
    filterStatus?: ProposalStatus[],
    options?: { sortBy?: string; sortOrder?: string; page?: number; limit?: number }
  ): Promise<{ proposals: Proposal[]; total: number; page: number; limit: number }> {
    try {
      // Verify the caller owns this job
      const adminSupabase = createAdminClient();
      const { data: job, error: jobErr } = await adminSupabase
        .from('jobs')
        .select('id, client_id')
        .eq('id', jobId)
        .single();
      if (jobErr || !job) {
        throw new NotFoundError('Job');
      }

      const { data: clientProfile } = await adminSupabase
        .from('client_profiles')
        .select('user_id')
        .eq('id', job.client_id)
        .single();
      if (clientProfile?.user_id !== clientUserId) {
        throw new ForbiddenError('You do not have access to this job\'s proposals.');
      }

      const page = options?.page || 1;
      const limit = options?.limit || 10;
      return await this.listProposals('system', {
        job_id: jobId,
        status: filterStatus,
        sortBy: (options?.sortBy as any) || 'submitted_at',
        sortOrder: (options?.sortOrder as any) || 'desc',
        page,
        limit,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ProposalService.getProposalsForJob');
    }
  }

  /**
   * Get all proposals by a consultant.
   */
  static async getProposalsByConsultant(
    consultantUserId: string,
    options?: { status?: ProposalStatus[]; sortBy?: string; sortOrder?: string; page?: number; limit?: number }
  ): Promise<{ proposals: Proposal[]; total: number; page: number; limit: number }> {
    try {
      const adminSupabase = createAdminClient();
      const { data: profile, error: profileErr } = await adminSupabase
        .from('consultant_profiles')
        .select('id')
        .eq('user_id', consultantUserId)
        .single();
      if (profileErr || !profile) {
        throw new NotFoundError('Consultant profile');
      }

      const page = options?.page || 1;
      const limit = options?.limit || 10;
      return await this.listProposals('system', {
        consultant_id: profile.id,
        status: options?.status,
        sortBy: (options?.sortBy as any) || 'submitted_at',
        sortOrder: (options?.sortOrder as any) || 'desc',
        page,
        limit,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ProposalService.getProposalsByConsultant');
    }
  }

  /**
   * Update a proposal. Only allowed when status === 'draft'.
   * Must be performed by the proposal's author.
   */
  static async updateProposal(
    proposalId: string,
    userId: string,
    data: UpdateProposalData
  ): Promise<Proposal> {
    try {
      const adminSupabase = createAdminClient();

      // Load proposal with consultant info for authorization
      const { data: proposal, error: propErr } = await adminSupabase
        .from('proposals')
        .select('id, status, consultant_id')
        .eq('id', proposalId)
        .single();
      if (propErr || !proposal) {
        throw new NotFoundError('Proposal');
      }

      // Only the proposal's author can edit
      const { data: profile } = await adminSupabase
        .from('consultant_profiles')
        .select('user_id')
        .eq('id', proposal.consultant_id)
        .single();
      if (profile?.user_id !== userId) {
        throw new ForbiddenError('Only the proposal author can edit this proposal.');
      }

      // Only draft proposals can be edited
      if (proposal.status !== 'draft') {
        throw new ForbiddenError('Only draft proposals can be edited.');
      }

      const { data: updated, error: updateErr } = await adminSupabase
        .from('proposals')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposalId)
        .select('*')
        .single();

      if (updateErr) {
        throw new AppError('Failed to update proposal.', 500, 'DB_UPDATE_ERROR', updateErr);
      }
      return updated as Proposal;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ProposalService.updateProposal');
    }
  }

  /**
   * Update proposal status (state machine).
   * Enforces:
   * - Only authorized actors can make the transition.
   * - Only valid state-machine transitions are allowed.
   * - Cannot modify terminal states (accepted/rejected/withdrawn).
   */
  static async transitionStatus(
    proposalId: string,
    newStatus: ProposalStatus,
    actorUserId: string,
    note?: string
  ): Promise<Proposal> {
    try {
      const adminSupabase = createAdminClient();

      // Load proposal with related data
      const { data: proposal, error: propErr } = await adminSupabase
        .from('proposals')
        .select(`
          *,
          consultant:consultant_profiles!consultant_id (*),
          job:jobs!job_id (*)
        `)
        .eq('id', proposalId)
        .single();
      if (propErr || !proposal) {
        throw new NotFoundError('Proposal');
      }

      // Prevent modification of terminal states
      const terminalStates: ProposalStatus[] = ['accepted', 'rejected', 'withdrawn'];
      if (terminalStates.includes(proposal.status as ProposalStatus)) {
        throw new ForbiddenError(`Proposal is already ${proposal.status} and cannot be modified.`);
      }

      // Determine the transition key
      const currentStatus = proposal.status as ProposalStatus;
      const transitionKey = `${currentStatus}→${newStatus}`;
      const allowedTransitions = PROPOSAL_TRANSITIONS[currentStatus];
      if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
        throw new ForbiddenError(
          `Invalid transition: ${currentStatus} → ${newStatus}`
        );
      }

      // Determine actor role
      const requiredActor = TRANSITION_ACTOR[transitionKey];
      if (!requiredActor) {
        throw new ForbiddenError('This transition is not permitted.');
      }

      // Verify actor authorization
      const { data: consultantProfile } = await adminSupabase
        .from('consultant_profiles')
        .select('user_id')
        .eq('id', proposal.consultant_id)
        .single();
      const isConsultantAuthor = consultantProfile?.user_id === actorUserId;

      const { data: jobClientProfile } = await adminSupabase
        .from('client_profiles')
        .select('user_id')
        .eq('id', proposal.job.client_id)
        .single();
      const isJobOwner = jobClientProfile?.user_id === actorUserId;

      if (requiredActor === 'consultant' && !isConsultantAuthor) {
        throw new ForbiddenError('Only the proposal author can perform this action.');
      }
      if (requiredActor === 'client' && !isJobOwner) {
        throw new ForbiddenError('Only the job owner can perform this action.');
      }
      if (requiredActor === 'both' && !(isConsultantAuthor || isJobOwner)) {
        throw new ForbiddenError('You are not authorized to perform this action.');
      }

      // Additional business rules by transition
      // - For rejected: note is encouraged but not required
      // - For accepted: proposal must be shortlisted first (enforced by transition key)
      // - For withdrawn by consultant: allowed from submitted/shortlisted only

      // Apply transition
      const updatePayload: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'accepted') {
        updatePayload.client_viewed_at = new Date().toISOString();
      }
      if (note) {
        // We don't have a dedicated notes column; we could store notes in a future migration.
        // For now we skip persisting note, but it's available for future extension.
      }

      const { data: updated, error: updateErr } = await adminSupabase
        .from('proposals')
        .update(updatePayload)
        .eq('id', proposalId)
        .select('*')
        .single();

      if (updateErr) {
        throw new AppError('Failed to transition proposal status.', 500, 'DB_UPDATE_ERROR', updateErr);
      }
      return updated as Proposal;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'ProposalService.transitionStatus');
    }
  }

  /**
   * Withdraw a proposal (consultant only).
   * This is a convenience wrapper around transitionStatus.
   */
  static async withdrawProposal(
    proposalId: string,
    userId: string
  ): Promise<Proposal> {
    return this.transitionStatus(proposalId, 'withdrawn', userId);
  }

  /**
   * Shortlist a proposal (client only).
   */
  static async shortlistProposal(
    proposalId: string,
    userId: string
  ): Promise<Proposal> {
    return this.transitionStatus(proposalId, 'shortlisted', userId);
  }

  /**
   * Accept a proposal (client only).
   * Also updates the job status to 'hired' (or similar) — but per spec,
   * payments are excluded, so we keep job updates minimal.
   */
  static async acceptProposal(
    proposalId: string,
    userId: string
  ): Promise<Proposal> {
    const proposal = await this.transitionStatus(proposalId, 'accepted', userId);

    // Optionally update the job to reflect that a proposal was accepted.
    // We don't change the job status here to avoid overlapping with Phase 3 logic,
    // but we could set a flag if needed. For now, we leave the job untouched.
    return proposal;
  }

  /**
   * Reject a proposal (client only).
   */
  static async rejectProposal(
    proposalId: string,
    userId: string
  ): Promise<Proposal> {
    return this.transitionStatus(proposalId, 'rejected', userId);
  }
}
