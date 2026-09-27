/**
 * Dispute administration.
 *
 * GET  /api/admin/disputes          — the queue, oldest first
 * GET  /api/admin/disputes/[id]     — one dispute with both statements and the
 *                                     evidence file list
 * PATCH /api/admin/disputes/[id]    — move to under_review, resolve or dismiss
 *
 * A resolution is recorded with the administrator who made it, the time, and the
 * audit entry that describes it. A dispute cannot reach a terminal state without
 * all three: the CHECK constraint in migration 00014 enforces the first two at the
 * database, and the service writes the third.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { adminDisputeFilterSchema, adminDisputeUpdateSchema } from '@/lib/validations/admin.schemas';
import { adminRoute, requireAdminUser } from '@/lib/admin/route-helpers';

function targetId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const params = request.nextUrl.searchParams;
    const filters = adminDisputeFilterSchema.parse({
      status: params.get('status') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
    });
    return NextResponse.json({
      success: true,
      data: await AdminService.listDisputes(auth.userId, filters),
    });
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request);
  if ('response' in auth) return auth.response;

  return adminRoute(async () => {
    const input = adminDisputeUpdateSchema.parse(await request.json());
    const data = await AdminService.updateDispute(auth.userId, targetId(request), input, auth.audit);
    return NextResponse.json({ success: true, data });
  });
}
