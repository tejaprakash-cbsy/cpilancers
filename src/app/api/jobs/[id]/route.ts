import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { JobService } from '@/services/job.service';
import { formatErrorResponse, ForbiddenError, NotFoundError } from '@/lib/errors';

function getId(request: NextRequest) { return request.nextUrl.pathname.split('/').filter(Boolean).pop()!; }

export async function GET(request: NextRequest) {
  try {
    const job = await JobService.getJobById(getId(request));
    if (!job) throw new NotFoundError('Job');
    return NextResponse.json({ success: true, data: job });
  } catch (error) { const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user || user.role !== 'client') throw new ForbiddenError('Only the owning client can update jobs.');
    const job = await JobService.updateJob(getId(request), user.id, await request.json());
    return NextResponse.json({ success: true, data: job });
  } catch (error) { const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode }); }
}
