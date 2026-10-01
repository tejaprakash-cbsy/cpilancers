/**
 * Individual Proposal API
 * GET    /api/proposals/[id]     — Get single proposal
 * PATCH  /api/proposals/[id]     — Update proposal (edit or status transition)
 * DELETE /api/proposals/[id]     — Withdraw a proposal
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProposalService } from '@/services/proposal.service';
import { proposalStatusUpdateSchema, proposalUpdateSchema } from '@/lib/validations/proposal.schemas';
import type { UpdateProposalData } from '@/services/proposal.service';
import { formatErrorResponse, ValidationError } from '@/lib/errors';

// Helper to get proposal ID from route params
function getProposalId(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/proposals\/([^/]+)/);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const proposalId = getProposalId(request);
    if (!proposalId) {
      throw new ValidationError('Proposal ID is required.');
    }

    const proposal = await ProposalService.getProposalById(proposalId, user.id);

    return NextResponse.json({ success: true, data: proposal }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const proposalId = getProposalId(request);
    if (!proposalId) {
      throw new ValidationError('Proposal ID is required.');
    }

    const requestBody = await request.json();

    // Determine if this is a status transition or a content update
    if (requestBody.status) {
      // Status transition
      const validated = proposalStatusUpdateSchema.parse(requestBody);
      const proposal = await ProposalService.transitionStatus(
        proposalId,
        validated.status,
        user.id,
        validated.note
      );
      return NextResponse.json({ success: true, data: proposal }, { status: 200 });
    } else {
      // Content update (only for draft proposals).
      //
      // The previous version hand-rolled this with truthiness checks
      // (`if (body.x) updateData.x = body.x`). That silently discarded any
      // legitimate zero/empty value -- a milestone worth 0 cents or a cleared
      // field -- and, more importantly, performed no validation at all, so
      // arbitrary types and out-of-range numbers reached the database. The
      // shared schema is used instead; unset fields stay absent via the
      // `!== undefined` test.
      const raw = requestBody as Record<string, unknown>;
      const validated = proposalUpdateSchema.parse(raw);
      const updateData: UpdateProposalData = {};
      if (validated.cover_letter_markdown !== undefined) updateData.cover_letter_markdown = validated.cover_letter_markdown;
      if (validated.technical_solution_markdown !== undefined) updateData.technical_solution_markdown = validated.technical_solution_markdown;
      if (validated.proposed_duration_weeks !== undefined) updateData.proposed_duration_weeks = validated.proposed_duration_weeks;
      if (validated.proposed_price_cents !== undefined) updateData.proposed_price_cents = validated.proposed_price_cents;
      if (validated.proposed_milestones !== undefined) updateData.proposed_milestones = validated.proposed_milestones;

      if (Object.keys(updateData).length === 0) {
        throw new ValidationError('No editable proposal fields were supplied.');
      }

      const proposal = await ProposalService.updateProposal(proposalId, user.id, updateData);
      return NextResponse.json({ success: true, data: proposal }, { status: 200 });
    }
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const proposalId = getProposalId(request);
    if (!proposalId) {
      throw new ValidationError('Proposal ID is required.');
    }

    // DELETE is treated as withdrawing the proposal
    const proposal = await ProposalService.withdrawProposal(proposalId, user.id);

    return NextResponse.json({ success: true, data: proposal, message: 'Proposal withdrawn successfully.' }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}