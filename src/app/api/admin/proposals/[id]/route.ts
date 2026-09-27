/**
 * A single proposal, with the server-assembled signals that make it worth a
 * second look.
 *
 * These signals are computed on read rather than stored. A stored score goes
 * stale as soon as the job's budget or the consultant's history changes, and
 * "suspicious" is not a fact about one row: it is a relationship between the
 * price, the budget, the author and the job.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

function targetId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const data = await AdminService.investigateProposal(auth.userId, targetId(request));
    return NextResponse.json({ success: true, data });
  });
}
