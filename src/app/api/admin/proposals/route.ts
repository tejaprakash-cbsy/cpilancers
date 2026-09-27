/**
 * Proposal administration.
 *
 * GET /api/admin/proposals          — search proposals
 * GET /api/admin/proposals/[id]     — one proposal with its risk signals
 *
 * There is no write endpoint for proposals, by design. A moderator's lever on a
 * suspicious proposal is the job it sits on (flag or remove it) or the account
 * behind it (suspend or ban), both of which are audited. Letting a moderator
 * silently rewrite a proposal's status would put an unaudited path into the
 * hiring flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminProposalSearchSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const params = request.nextUrl.searchParams;
    const filters = adminProposalSearchSchema.parse({
      query: params.get('query') ?? undefined,
      jobId: params.get('jobId') ?? undefined,
      status: params.get('status') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });
    return NextResponse.json({
      success: true,
      data: await AdminService.searchProposals(auth.userId, filters),
    });
  });
}
