import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { JobService } from '@/services/job.service';
import { formatErrorResponse, ForbiddenError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) throw new ForbiddenError('Authentication required.');
    if (user.role !== 'client') throw new ForbiddenError('Only clients can create jobs.');
    const body = await request.json();
    const required = ['title', 'description_markdown', 'deliverables_markdown', 'integration_type', 'source_systems', 'target_systems', 'protocols', 'estimated_duration_weeks', 'budget_type', 'budget_fixed_cents'];
    if (required.some((key) => body[key] === undefined || body[key] === null || body[key] === '')) throw new ForbiddenError('Required job fields are missing.');
    const job = await JobService.createJob({ ...body, expected_throughput_tier: 'moderate_1k_100k', complexity: 'moderate', company_id: undefined } as any);
    return NextResponse.json({ success: true, data: job }, { status: 201 });
  } catch (error) { const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode }); }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await JobService.getJobs({
      page: Number(params.get('page') || 1), limit: Number(params.get('limit') || 10),
      search: params.get('search') || undefined, budgetMin: params.get('budgetMin') ? Number(params.get('budgetMin')) : undefined,
      budgetMax: params.get('budgetMax') ? Number(params.get('budgetMax')) : undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) { const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode }); }
}
