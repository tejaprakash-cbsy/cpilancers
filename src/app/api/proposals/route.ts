/**
 * Proposals API
 * POST  /api/proposals     — Submit a new proposal (consultant)
 * GET   /api/proposals     — List proposals for current consultant
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProposalService } from '@/services/proposal.service';
import { proposalCreateSchema, proposalFilterSchema } from '@/lib/validations/proposal.schemas';
import { formatErrorResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }
    if (user.role !== 'consultant') {
      return NextResponse.json(
        { success: false, error: { message: 'Only consultants can submit proposals.', code: 'FORBIDDEN' }, statusCode: 403 },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = proposalCreateSchema.parse(body);

    const proposal = await ProposalService.createProposal(user.id, {
      job_id: validated.job_id,
      cover_letter_markdown: validated.cover_letter_markdown,
      technical_solution_markdown: validated.technical_solution_markdown,
      proposed_duration_weeks: validated.proposed_duration_weeks,
      proposed_price_cents: validated.proposed_price_cents,
      proposed_milestones: validated.proposed_milestones || [],
      status: validated.save_as_draft ? 'draft' : 'submitted',
    });

    return NextResponse.json({ success: true, data: proposal }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
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

    // Only consultants can list their proposals via this endpoint
    // Clients use /api/jobs/[id]/proposals instead
    if (user.role !== 'consultant') {
      return NextResponse.json(
        { success: false, error: { message: 'Only consultants can access this endpoint.', code: 'FORBIDDEN' }, statusCode: 403 },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const filterData = {
      status: url.searchParams.get('status')
        ? url.searchParams.get('status')!.split(',').filter(Boolean) as any
        : undefined,
      sortBy: (url.searchParams.get('sortBy') as any) || 'submitted_at',
      sortOrder: (url.searchParams.get('sortOrder') as any) || 'desc',
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '10'),
    };

    const validatedFilter = proposalFilterSchema.parse({
      ...filterData,
      job_id: url.searchParams.get('job_id') || undefined,
    });

    const result = await ProposalService.getProposalsByConsultant(user.id, {
      status: validatedFilter.status,
      sortBy: validatedFilter.sortBy,
      sortOrder: validatedFilter.sortOrder,
      page: validatedFilter.page,
      limit: validatedFilter.limit,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}
