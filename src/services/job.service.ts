import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Job, JobStatus } from '@/types/database';
import { AppError } from '@/lib/errors';

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
    status?: JobStatus[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
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

      // Experience Min
      if (options.experienceMin !== undefined) {
        query = query.gte('experience_required', options.experienceMin);
      }

      // Project Type
      if (options.projectType) {
        query = query.ilike('project_type', `%${options.projectType}%`);
      }

      // Status
      if (options.status?.length) {
        query = query.in('status', options.status);
      }

      // Sorting
      const sortBy = options.sortBy ?? 'created_at';
      const sortOrder = options.sortOrder ?? 'desc';
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
      const { data: owner } = await adminSupabase.from('jobs').select('*, client_profiles!inner(user_id)').eq('id', id).single();
      if (!owner || (owner as any).client_profiles?.user_id !== userId) throw new AppError('You do not own this job', 403);
      const allowedFields = ['title', 'description_markdown', 'deliverables_markdown', 'integration_type', 'source_systems', 'target_systems', 'protocols', 'expected_throughput_tier', 'complexity', 'estimated_duration_weeks', 'budget_type', 'budget_fixed_cents', 'budget_min_cents', 'budget_max_cents', 'expires_at'];
      const updates = Object.fromEntries(Object.entries(data).filter(([key]) => allowedFields.includes(key)));
      if (data.status !== undefined) {
        const allowedStatus: Record<string, string[]> = { draft: ['open', 'cancelled'], open: ['closed', 'in_review'], in_review: ['closed'], hired: ['closed'] };
        if (!allowedStatus[owner.status]?.includes(data.status)) throw new AppError('Invalid job status transition', 409);
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
      const { data: job, error: fetchError } = await adminSupabase
        .from('jobs')
        .select('status, client_profiles!inner(user_id)')
        .eq('id', id)
        .single();
      if (fetchError || !job || (job as any).client_profiles?.user_id !== userId) {
        throw new AppError('Job not found', 404);
      }
      if (job.status !== 'draft') {
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
      const { data: job, error: fetchError } = await adminSupabase
        .from('jobs')
        .select('status, client_profiles!inner(user_id)')
        .eq('id', id)
        .single();
      if (fetchError || !job || (job as any).client_profiles?.user_id !== userId) {
        throw new AppError('Job not found', 404);
      }
      // Allow closing jobs that are open, in_review, hired
      const closeableStatuses = ['open', 'in_review', 'hired'];
      if (!closeableStatuses.includes(job.status as JobStatus)) {
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
   * Delete a job (set status to deleted)
   */
  static async deleteJob(id: string, userId: string): Promise<void> {
    try {
      const adminSupabase = createAdminClient();
      const { data: job, error: fetchError } = await adminSupabase
        .from('jobs')
        .select('status, client_profiles!inner(user_id)')
        .eq('id', id)
        .single();
      if (fetchError || !job || (job as any).client_profiles?.user_id !== userId) {
        throw new AppError('Job not found', 404);
      }
      // Only allow deletion of draft jobs
      if (job.status !== 'draft') {
        throw new AppError('Only draft jobs can be deleted', 400);
      }
      const { error } = await adminSupabase
        .from('jobs')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
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
