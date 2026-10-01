import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { JobService, PUBLICLY_LISTABLE_JOB_STATUSES } from '@/services/job.service';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatErrorResponse, ForbiddenError, NotFoundError } from '@/lib/errors';

function getId(request: NextRequest) { return request.nextUrl.pathname.split('/').filter(Boolean).pop()!; }

export async function GET(request: NextRequest) {
  try {
    const job = await JobService.getJobById(getId(request));
    if (!job) throw new NotFoundError('Job');

    // A job outside the publicly listable set is a draft, cancelled or closed
    // posting. It stays readable by nobody except the client who owns it --
    // otherwise anyone who learns or guesses the id could read an unpublished
    // brief, including its budget and internal requirements.
    if (!(PUBLICLY_LISTABLE_JOB_STATUSES as string[]).includes(job.status)) {
      const viewer = await AuthService.getCurrentUser().catch(() => null);
      if (!viewer) throw new NotFoundError('Job');

      const { data: clientProfile } = await createAdminClient()
        .from('client_profiles')
        .select('id')
        .eq('user_id', viewer.id)
        .maybeSingle();

      // Non-owners get the same 404 as a missing job: a 403 would confirm the
      // job exists, turning the endpoint into an id oracle.
      if (!clientProfile || clientProfile.id !== job.client_id) {
        throw new NotFoundError('Job');
      }
    }

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

/**
 * Delete a draft job.
 *
 * The client wrapper `ClientJobService.deleteJob` has always issued
 * `DELETE /api/jobs/[id]`, but this route exported no DELETE handler, so the
 * browser received 405 and drafts could not be removed through the app at all.
 * Authorization is delegated to `JobService.deleteJob`, which re-checks
 * ownership from the `client_profiles` join and returns 404 for anyone who is
 * not the owner.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user || user.role !== 'client') throw new ForbiddenError('Only the owning client can delete jobs.');
    await JobService.deleteJob(getId(request), user.id);
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) { const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode }); }
}
