import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { JobService, resolveJobVisibility } from '@/services/job.service';
import { formatErrorResponse, ForbiddenError, ValidationError } from '@/lib/errors';

import type { Job } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) throw new ForbiddenError('Authentication required.');
    if (user.role !== 'client') throw new ForbiddenError('Only clients can create jobs.');
    const body = await request.json();
    const required = ['title', 'description_markdown', 'deliverables_markdown', 'integration_type', 'source_systems', 'target_systems', 'protocols', 'estimated_duration_weeks', 'budget_type', 'budget_fixed_cents'];
    if (required.some((key) => body[key] === undefined || body[key] === null || body[key] === '')) throw new ValidationError('Required job fields are missing.');
    // Server-owned fields are overwritten here rather than trusted from the
    // body, so a client cannot post `status`, `views_count`, `proposals_count`,
    // `client_id` or `company_id` to seed a job with someone else's identity or
    // to bypass the draft-first workflow.
    const job = await JobService.createJob({
      ...body,
      expected_throughput_tier: 'moderate_1k_100k',
      complexity: 'moderate',
      company_id: undefined,
    } as Omit<Job, 'id' | 'client_id' | 'company_id' | 'slug' | 'status' | 'views_count' | 'proposals_count' | 'hired_at' | 'expires_at' | 'created_at' | 'updated_at'>);
    return NextResponse.json({ success: true, data: job }, { status: 201 });
  } catch (error) { const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode }); }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    // Authenticate when possible. Listing is public, but resolving the viewer
    // is what lets an owning client include their own drafts. Failure to
    // resolve a user must not widen visibility, so a null viewer is used and the
    // public status set applies.
    const viewer = await AuthService.getCurrentUser().catch(() => null);
    const visibility = await resolveJobVisibility(viewer?.id ?? null);

    // Bound the page window. Without a cap, `?limit=1000000` asks PostgREST for
    // the entire table in one round trip, and a negative or non-numeric page
    // produces a nonsensical `from` that silently returns wrong rows.
    const rawPage = Number(params.get('page'));
    const rawLimit = Number(params.get('limit'));
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(Math.floor(rawLimit), 50) : 10;

    // `Number('abc')` is NaN; reject it rather than passing NaN to a
    // comparison that silently matches every row.
    const numOrUndefined = (raw: string | null): number | undefined => {
      if (raw === null || raw === '') return undefined;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) throw new ValidationError(`Invalid numeric filter: ${raw}`);
      return parsed;
    };

    const requestedStatus = params.get('status');
    const statusFilter = requestedStatus
      ? (requestedStatus.split(',').map((s) => s.trim()).filter(Boolean) as Job['status'][])
      : undefined;

    const result = await JobService.getJobs({
      page,
      limit,
      search: params.get('search') || undefined,
      budgetMin: numOrUndefined(params.get('budgetMin')),
      budgetMax: numOrUndefined(params.get('budgetMax')),
      budgetType: params.get('budgetType') || undefined,
      // `experienceMin` is still parsed so a malformed value is rejected with a
      // 400 rather than ignored, but it is deliberately NOT forwarded: the
      // `experience_required` column does not exist on `jobs`, so applying it
      // made PostgREST reject the whole query.
      status: statusFilter,
      allowedStatuses: visibility.allowedStatuses,
      draftOwnerClientId: visibility.draftOwnerClientId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) { const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode }); }
}
