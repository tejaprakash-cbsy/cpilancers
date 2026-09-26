/**
 * Job Proposals API
 * GET /api/jobs/[id]/proposals — List proposals for a specific job (client only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProposalService } from '@/services/proposal.service';
import { proposalFilterSchema } from '@/lib/validations/proposal.schemas';
import { formatErrorResponse } from '@/lib/errors';

// Helper to get job ID from route params
function getJobId(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/jobs\/([^/]+)\/proposals/);
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

    if (user.role !== 'client') {
      return NextResponse.json(
        { success: false, error: { message: 'Only clients can view job proposals.', code: 'FORBIDDEN' }, statusCode: 403 },
        { status: 403 }
      );
    }

    const jobId = getJobId(request);
    if (!jobId) {
      throw new Error('Job ID is required.');
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const statuses = statusParam
      ? (statusParam.split(',').filter(Boolean) as any)
      : undefined;

    const validatedFilter = proposalFilterSchema.parse({
      status: statuses,
      sortBy: (url.searchParams.get('sortBy') as any) || 'submitted_at',
      sortOrder: (url.searchParams.get('sortOrder') as any) || 'desc',
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '10'),
    });

    const result = await ProposalService.getProposalsForJob(
      jobId,
      user.id,
      statuses,
      {
        sortBy: validatedFilter.sortBy,
        sortOrder: validatedFilter.sortOrder,
        page: validatedFilter.page,
        limit: validatedFilter.limit,
      }
    );

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}
