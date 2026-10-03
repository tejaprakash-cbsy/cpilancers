import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Job, JobStatus } from '@/types/database';
import { AppError } from '@/lib/errors';
import { jobEditSchema } from '@/lib/validations/job.schemas';
import { z } from 'zod';

/**
 * Statuses a job may hold while it is legitimately visible in the public
 * marketplace. Anything else -- a draft a client has not published, a job that
 * has been cancelled, deleted or completed -- must never be enumerable by an
 * unauthenticated or unrelated caller.
 */
export const PUBLICLY_LISTABLE_JOB_STATUSES: JobStatus[] = ['open', 'in_review'];

/**
 * What a given viewer is allowed to see when listing jobs.
 *
 * `allowedStatuses` is the ceiling on statuses. `draftOwnerClientId` is the
 * `client_profiles.id` whose drafts the viewer may read; it is `null` when the
 * viewer may read no drafts at all. The two are needed together because
 * "may see drafts" and "is the owner of every draft the query will return" are
 * not the same statement -- without the id, `getJobs` would have to return
 * every client's drafts.
 */
export interface JobVisibility {
  allowedStatuses: JobStatus[];
  draftOwnerClientId: string | null;
}

/** UUID shape check, used before interpolating an id into a PostgREST filter. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Resolve which job statuses a given viewer may see, and whose drafts.
 *
 * Anonymous and non-client viewers are limited to the public set. A user with a
 * `client_profiles` row additionally sees *their own* drafts so the
 * create/edit workflow can find the job it just made -- which is why the
 * owning `client_profiles.id` is returned alongside the statuses. Callers pass
 * both into `getJobs`, which intersects the statuses with any `status` filter
 * the request supplied (narrowing only) and scopes drafts to that client id.
 *
 * Fails closed on an unreadable ownership check.
 */
export async function resolveJobVisibility(
  viewerUserId: string | null
): Promise<JobVisibility> {
  const publicOnly = (): JobVisibility => ({
    allowedStatuses: [...PUBLICLY_LISTABLE_JOB_STATUSES],
    draftOwnerClientId: null,
  });

  if (!viewerUserId) return publicOnly();

  try {
    const { data: clientProfile } = await createAdminClient()
      .from('client_profiles')
      .select('id')
      .eq('user_id', viewerUserId)
      .maybeSingle();

    if (!clientProfile || !isUuid(clientProfile.id)) return publicOnly();
    return {
      allowedStatuses: [...PUBLICLY_LISTABLE_JOB_STATUSES, 'draft'],
      draftOwnerClientId: clientProfile.id,
    };
  } catch (error) {
    // Fail closed: an unreadable ownership check must not widen visibility.
    console.error('[JobService.resolveJobVisibility]:', error);
    return publicOnly();
  }
}

/**
 * Resolve which job statuses a given viewer may see.
 *
 * Thin wrapper over {@link resolveJobVisibility} for callers that only need the
 * status ceiling and have no path to scope drafts.
 */
export async function jobVisibility(
  viewerUserId: string | null
): Promise<JobStatus[]> {
  return (await resolveJobVisibility(viewerUserId)).allowedStatuses;
}

/**
 * The `client_profiles!inner(user_id)` embed used to resolve a job's owner.
 *
 * The embed is a many-to-one relation, so PostgREST returns an object -- but
 * supabase-js types the column as an array of rows because it cannot infer the
 * cardinality from the FK. Reading `client_profiles.user_id` off that value
 * directly therefore always yielded `undefined`, which made every ownership
 * check below compare `undefined !== userId` and reject *everyone*, including
 * the real owner. Both shapes are normalised here so ownership resolves
 * correctly regardless of which one the client returns.
 */
type JobOwnerEmbed = { user_id: string } | { user_id: string }[] | null;

function readOwnerUserId(embed: JobOwnerEmbed): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.user_id ?? null;
}

type JobWithOwner = { status: string; client_profiles: JobOwnerEmbed };

/**
 * Resolve the owning user and current status for a job, or null when the job
 * does not exist or the client profile row is missing.
 */
async function resolveJobOwnership(
  jobId: string
): Promise<{ userId: string; status: string } | null> {
  const { data, error } = await createAdminClient()
    .from('jobs')
    .select('status, client_profiles!inner(user_id)')
    .eq('id', jobId)
    .single();

  if (error || !data) return null;
  const owner = readOwnerUserId((data as unknown as JobWithOwner).client_profiles);
  if (!owner) return null;
  return { userId: owner, status: data.status };
}

export class JobService {
  /**
   * Get a job by ID
   */
  static async getJobById(id: string): Promise<Job | null> {
    try {
      const supabase = await createClient();
      const { data: job, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        console.error('[DB Error - Get Job By ID]:', error);
        return null;
      }
      return job;
    } catch (error) {
      console.error('[JobService.getJobById]:', error);
      return null;
    }
  }

  /**
   * Get client ID by user ID
   */
  static async getClientIdByUserId(userId: string): Promise<string | null> {
    try {
      const supabase = await createClient();
      const { data: clientProfile, error } = await supabase
        .from('client_profiles')
        .select('id, company_id')
        .eq('user_id', userId)
        .single();
      if (error) {
        console.error('[DB Error - Get Client Profile By User ID]:', error);
        return null;
      }
      return clientProfile?.id ?? null;
    } catch (error) {
      console.error('[JobService.getClientIdByUserId]:', error);
      return null;
    }
  }

  /**
   * Get jobs with filtering and pagination
   */
  static async getJobs(options: {
    page?: number;
    limit?: number;
    search?: string;
    sapProducts?: string[];
    sourceSystems?: string[];
    targetSystems?: string[];
    integrationTypes?: string[];
    protocols?: string[];
    budgetMin?: number;
    budgetMax?: number;
    experienceMin?: number;
    projectType?: string;
    /** Real `budget_type` enum: 'fixed_price' | 'hourly_rate' | 'range'. */
    budgetType?: string;
    status?: JobStatus[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    allowedStatuses?: JobStatus[];
    /**
     * `client_profiles.id` whose drafts the viewer may read, from
     * {@link resolveJobVisibility}. Required whenever `allowedStatuses`
     * contains `'draft'`; without it drafts are dropped rather than returned
     * unscoped.
     */
    draftOwnerClientId?: string | null;
  }): Promise<{ jobs: Job[]; total: number; page: number; limit: number }> {
    try {
      const supabase = await createClient();
      const page = options.page ?? 1;
      const limit = options.limit ?? 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('jobs')
        .select('*', { count: 'exact' });

      // Search
      if (options.search) {
        const searchTerm = `%${options.search}%`;
        query = query.or(`title.ilike.${searchTerm},description_markdown.ilike.${searchTerm}`);
      }

      // SAP Products - not stored in jobs table; ignore for now
      // if (options.sapProducts?.length) {
      //   // TODO: Implement if sap_products relation exists
      // }

      // Source Systems
      if (options.sourceSystems?.length) {
        // Assuming source_systems is a text array; we need to check overlap?
        // For simplicity, we'll require all selected source systems to be present.
        // Use contains for each? Actually we want jobs where source_systems contains all selected?
        // We'll implement as: source_systems contains each selected value.
        for (const system of options.sourceSystems) {
          query = query.contains('source_systems', [system]);
        }
      }

      // Target Systems
      if (options.targetSystems?.length) {
        for (const system of options.targetSystems) {
          query = query.contains('target_systems', [system]);
        }
      }

      // Integration Types
      if (options.integrationTypes?.length) {
        query = query.in('integration_type', options.integrationTypes);
      }

      // Protocols
      if (options.protocols?.length) {
        // Ensure job's protocols array contains all selected protocols
        for (const protocol of options.protocols) {
          query = query.contains('protocols', [protocol]);
        }
      }

      // Budget Min/Max - simplified: check budget_fixed_cents range (ignore budget_type complexity)
      if (options.budgetMin !== undefined) {
        query = query.gte('budget_fixed_cents', options.budgetMin);
      }
      if (options.budgetMax !== undefined) {
        query = query.lte('budget_fixed_cents', options.budgetMax);
      }

      // Budget type.
      //
      // The previous `projectType` and `experienceMin` filters were wired to
      // `project_type` and `experience_required`, neither of which exists on the
      // `jobs` table in any migration. PostgREST rejected the entire query as
      // soon as either filter was supplied, so using the "Project type" or
      // "Experience level" controls on /jobs returned a 500. `budget_type` is a
      // real enum ('fixed_price' | 'hourly_rate' | 'range') and is what those
      // controls actually offered.
      if (options.budgetType) {
        query = query.eq('budget_type', options.budgetType);
      }

      // Status visibility, in three ordered steps.
      //
      //   1. `allowedStatuses` (when supplied) is the ceiling. Without it the
      //      public set applies, so no caller can read the whole table.
      //   2. A caller-supplied `status` list is INTERSECTED with that ceiling,
      //      so `?status=draft` from an anonymous visitor matches nothing
      //      rather than every row.
      //   3. Drafts are visible only to their owning client, so when drafts are
      //      in scope the filter becomes
      //      `status in (public) OR (status = draft AND client_id = <viewer>)`.
      const ceiling = options.allowedStatuses ?? PUBLICLY_LISTABLE_JOB_STATUSES;
      let effective: JobStatus[] = options.status?.length
        ? options.status.filter((status) => ceiling.includes(status))
        : [...ceiling];

      // Drafts are meaningless without the owner id to scope them to. If it is
      // absent or malformed, drop drafts instead of returning every client's.
      const draftScope =
        effective.includes('draft') && isUuid(options.draftOwnerClientId)
          ? options.draftOwnerClientId
          : null;
      if (effective.includes('draft') && !draftScope) {
        effective = effective.filter((status) => status !== 'draft');
      }

      if (effective.length === 0) {
        // This viewer may not see anything matching the request. Short-circuit
        // rather than sending a query with no status filter at all.
        return { jobs: [], total: 0, page, limit };
      }

      const publicPart = draftScope ? effective.filter((status) => status !== 'draft') : effective;
      if (draftScope && publicPart.length > 0) {
        query = query.or(
          [
            ...publicPart.map((status) => `status.eq.${status}`),
            // `draftScope` is validated as a UUID above and originates from the
            // `client_profiles` row, never from request input.
            `and(status.eq.draft,client_id.eq.${draftScope})`,
          ].join(',')
        );
      } else {
        query = query.in('status', effective);
      }

      // Sorting.
      // `sortBy` reaches PostgREST's `order=` parameter, so it is checked
      // against an allowlist at runtime rather than trusted. The `/api/jobs`
      // route does not forward a caller-supplied sortBy today, but this service
      // is reachable from other call sites and the check is the actual
      // boundary.
      const allowedSortFields = [
        'created_at',
        'updated_at',
        'views_count',
        'title',
        'budget_fixed_cents',
      ] as const;
      const requestedSort = options.sortBy ?? 'created_at';
      const sortBy = allowedSortFields.includes(
        requestedSort as (typeof allowedSortFields)[number]
      )
        ? requestedSort
        : 'created_at';
      const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Pagination
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) {
        console.error('[DB Error - Get Jobs]:', error);
        throw new AppError('Failed to fetch jobs', 500);
      }

      return {
        jobs: data as Job[],
        total: count ?? 0,
        page,
        limit,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[JobService.getJobs]:', error);
      throw new AppError('Failed to fetch jobs', 500);
    }
  }

  /**
   * Create a new job
   */
  static async createJob(data: Omit<Job, 'id' | 'client_id' | 'company_id' | 'slug' | 'status' | 'views_count' | 'proposals_count' | 'hired_at' | 'expires_at' | 'created_at' | 'updated_at'>): Promise<Job> {
    try {
      const adminSupabase = createAdminClient();
      // Determine client_id from user? Actually the data should include client_id from the authenticated user.
      // We expect the caller to provide client_id in data? The create page does not pass client_id; it uses the current user's client profile.
      // We'll need to get the client_id from the user context. However, the service method signature does not include userId.
      // Looking at the create page, they call JobService.createJob with an object that does not include client_id.
      // They likely expect the service to infer the client_id from the current user.
      // We'll need to get the user ID and then get the client profile ID.
      // But we cannot rely on auth inside the service? We can use createClient to get user.
      // However, to avoid extra dependency, we can change the method to accept userId or clientId.
      // But to keep the existing call unchanged, we'll implement as: get the current user's client profile ID.
      // We'll use createClient to get the user, then get client profile.
      // This is acceptable because the service is server-side (route handler) and the user is authenticated.
      // We'll implement inside the method.

      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new AppError('Authentication required', 401);
      }

      const { data: clientProfile, error: clientProfileError } = await supabase
        .from('client_profiles')
        .select('id, company_id')
        .eq('user_id', user.id)
        .single();
      if (clientProfileError || !clientProfile) {
        throw new AppError('Client profile not found', 400);
      }

      const slugBase = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';
      const jobData = {
        client_id: clientProfile.id,
        company_id: clientProfile.company_id,
        title: data.title,
        slug: `${slugBase}-${crypto.randomUUID()}`,
        integration_type: data.integration_type,
        source_systems: data.source_systems,
        target_systems: data.target_systems,
        protocols: data.protocols,
        expected_throughput_tier: data.expected_throughput_tier || 'moderate_1k_100k',
        complexity: data.complexity || 'moderate',
        description_markdown: data.description_markdown,
        deliverables_markdown: data.deliverables_markdown,
        estimated_duration_weeks: data.estimated_duration_weeks,
        budget_type: data.budget_type,
        budget_fixed_cents: data.budget_fixed_cents,
        budget_min_cents: data.budget_min_cents,
        budget_max_cents: data.budget_max_cents,
        status: 'draft',
        views_count: 0,
        proposals_count: 0,
        hired_at: null,
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: job, error } = await adminSupabase
        .from('jobs')
        .insert(jobData)
        .select()
        .single();
      if (error) {
        console.error('[DB Error - Create Job]:', error);
        throw new AppError('Failed to create job', 500);
      }
      return job as Job;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[JobService.createJob]:', error);
      throw new AppError('Failed to create job', 500);
    }
  }

  /**
   * Update a job
   */
  static async updateJob(id: string, userId: string, data: Partial<Job>): Promise<Job> {
    try {
      const adminSupabase = createAdminClient();
      const ownership = await resolveJobOwnership(id);
      if (!ownership || ownership.userId !== userId) throw new AppError('You do not own this job', 403);
      // F-14: validate the editable values BEFORE the database write.
      //
      // Without this, invalid input reached Postgres and the resulting CHECK /
      // NOT NULL / enum violation was caught by the generic `error` branch below
      // and reported as `AppError('Failed to update job', 500)`. A client that
      // sent a negative budget was told the server had a fault. Some bad input
      // was worse than a 500: `title: ""` violated no constraint at all and was
      // silently persisted.
      //
      // `jobEditSchema` is the schema that already governs this form; it is
      // reused as-is rather than duplicated or weakened. The ORIGINAL `data` is
      // still what continues below, because the schema strips keys it does not
      // model -- `status` is sent by publishJob/closeJob, and
      // `deliverables_markdown` is a real column the schema omits. Those stay
      // governed by the allowlist and the status-transition rules below.
      //
      // This sits AFTER the ownership check so an unauthorized caller still gets
      // 403 regardless of what the body contains, exactly as before.
      jobEditSchema.parse(data);
      const allowedFields = ['title', 'description_markdown', 'deliverables_markdown', 'integration_type', 'source_systems', 'target_systems', 'protocols', 'expected_throughput_tier', 'complexity', 'estimated_duration_weeks', 'budget_type', 'budget_fixed_cents', 'budget_min_cents', 'budget_max_cents', 'expires_at'];
      const updates: Record<string, unknown> = Object.fromEntries(Object.entries(data).filter(([key]) => allowedFields.includes(key)));
      if (data.status !== undefined) {
        const allowedStatus: Record<string, string[]> = { draft: ['open', 'cancelled'], open: ['closed', 'in_review'], in_review: ['closed'], hired: ['closed'] };
        if (!allowedStatus[ownership.status]?.includes(data.status)) throw new AppError('Invalid job status transition', 409);
        updates.status = data.status;
      }
      const { data: job, error } = await adminSupabase
        .from('jobs')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        console.error('[DB Error - Update Job]:', error);
        throw new AppError('Failed to update job', 500);
      }
      return job as Job;
    } catch (error) {
      if (error instanceof AppError) throw error;
      // F-14: a schema failure is a client input error, not a server fault. The
      // generic branch below would otherwise re-wrap the ZodError as
      // `AppError('Failed to update job', 500)` and undo the whole point of
      // validating up front. Letting it propagate lets `formatErrorResponse`
      // render it as the conventional 400 VALIDATION_ERROR.
      if (error instanceof z.ZodError) throw error;
      console.error('[JobService.updateJob]:', error);
      throw new AppError('Failed to update job', 500);
    }
  }

  /**
   * Publish a job (change status from draft to open)
   */
  static async publishJob(id: string, userId: string): Promise<void> {
    try {
      const adminSupabase = createAdminClient();
      const ownership = await resolveJobOwnership(id);
      if (!ownership || ownership.userId !== userId) {
        throw new AppError('Job not found', 404);
      }
      if (ownership.status !== 'draft') {
        throw new AppError('Only draft jobs can be published', 400);
      }
      const { error } = await adminSupabase
        .from('jobs')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        console.error('[DB Error - Publish Job]:', error);
        throw new AppError('Failed to publish job', 500);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[JobService.publishJob]:', error);
      throw new AppError('Failed to publish job', 500);
    }
  }

  /**
   * Close a job (set status to closed)
   */
  static async closeJob(id: string, userId: string): Promise<void> {
    try {
      const adminSupabase = createAdminClient();
      const ownership = await resolveJobOwnership(id);
      if (!ownership || ownership.userId !== userId) {
        throw new AppError('Job not found', 404);
      }
      // Allow closing jobs that are open, in_review, hired
      const closeableStatuses = ['open', 'in_review', 'hired'];
      if (!closeableStatuses.includes(ownership.status)) {
        throw new AppError('Job cannot be closed in current status', 400);
      }
      const { error } = await adminSupabase
        .from('jobs')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        console.error('[DB Error - Close Job]:', error);
        throw new AppError('Failed to close job', 500);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[JobService.closeJob]:', error);
      throw new AppError('Failed to close job', 500);
    }
  }

  /**
   * Delete a job.
   *
   * Only an unpublished draft may be deleted, and "deleted" is achieved by
   * moving it to `cancelled` rather than removing the row: `jobs` is referenced
   * by `proposals`, `job_skills` and `conversations`, and hard-deleting a job
   * would cascade those away with it. `cancelled` is also already an allowed
   * `draft -> cancelled` transition in `updateJob`.
   *
   * The previous implementation wrote `status: 'deleted'`, which is not a member
   * of the `job_status` enum ('draft' | 'open' | 'in_review' | 'hired' |
   * 'completed' | 'cancelled' | 'closed'), so every call failed at the database
   * with a 22P02 enum error surfaced as a generic 500.
   */
  static async deleteJob(id: string, userId: string): Promise<void> {
    try {
      const adminSupabase = createAdminClient();
      const ownership = await resolveJobOwnership(id);
      if (!ownership || ownership.userId !== userId) {
        throw new AppError('Job not found', 404);
      }
      // Only allow deletion of draft jobs
      if (ownership.status !== 'draft') {
        throw new AppError('Only draft jobs can be deleted', 400);
      }
      const { error } = await adminSupabase
        .from('jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        console.error('[DB Error - Delete Job]:', error);
        throw new AppError('Failed to delete job', 500);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[JobService.deleteJob]:', error);
      throw new AppError('Failed to delete job', 500);
    }
  }
}
