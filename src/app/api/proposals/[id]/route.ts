/**
 * Individual Proposal API
 * GET    /api/proposals/[id]     — Get single proposal
 * PATCH  /api/proposals/[id]     — Update proposal (edit or status transition)
 * DELETE /api/proposals/[id]     — Withdraw a proposal
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProposalService } from '@/services/proposal.service';
import { proposalStatusUpdateSchema } from '@/lib/validations/proposal.schemas';
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

    const body = await request.json();

    // Determine if this is a status transition or a content update
    if (body.status) {
      // Status transition
      const validated = proposalStatusUpdateSchema.parse(body);
      const proposal = await ProposalService.transitionStatus(
        proposalId,
        validated.status as any,
        user.id,
        validated.note
      );
      return NextResponse.json({ success: true, data: proposal }, { status: 200 });
    } else {
      // Content update (only for draft proposals)
      const updateData: any = {};
      if (body.cover_letter_markdown) updateData.cover_letter_markdown = body.cover_letter_markdown;
      if (body.technical_solution_markdown) updateData.technical_solution_markdown = body.technical_solution_markdown;
      if (body.proposed_duration_weeks) updateData.proposed_duration_weeks = body.proposed_duration_weeks;
      if (body.proposed_price_cents) updateData.proposed_price_cents = body.proposed_price_cents;
      if (body.proposed_milestones) updateData.proposed_milestones = body.proposed_milestones;

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