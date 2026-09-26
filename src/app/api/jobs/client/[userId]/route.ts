import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { JobService } from '@/services/job.service';
import { formatErrorResponse, ForbiddenError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    const target = request.nextUrl.pathname.split('/').filter(Boolean).pop();
    if (!user || user.id !== target) throw new ForbiddenError('Access denied.');
    return NextResponse.json({ success: true, data: await JobService.getClientIdByUserId(user.id) });
  } catch (error) { const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode }); }
}
