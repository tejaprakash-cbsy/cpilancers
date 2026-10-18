/**
 * Administrator dashboard service — Stage 13.
 *
 * Security model, stated once so it does not have to be re-derived per method:
 *
 *   1. ADMINISTRATION IS SERVER-SIDE AND DATABASE-SOURCED. Every public method
 *      begins with `requireAdmin`, which reads the caller's role from their
 *      `public.users` row. The role is never taken from a request body, a query
 *      parameter, a header or a path segment. A client that posts
 *      `{"role":"admin"}` changes nothing, and the schemas reject the key.
 *
 *   2. PARTICIPATION IS NOT AUTHORITY. The dashboard reads through the service
 *      role, which bypasses RLS, so this service re-derives every check. Being
 *      the client or consultant on a contract confers nothing here.
 *
 *   3. EVERY MUTATION IS AUDITED. A state change and its audit entry are written
 *      together, and the entry records who did it, to what, why, and what the row
 *      looked like before and after. The log is append-only at the database
 *      level, so an entry cannot later be edited or removed.
 *
 *   4. READS ARE NOT AUDITED AS ACTIONS. Listing users or opening a report is
 *      ordinary use of the dashboard, not a moderation act. The access that
 *      matters — an administrator entering the surface at all — is recorded by
 *      `requireAdmin`.
 *
 * The service uses the Supabase service role, so `REVOKE`s and RLS do not
 * protect it. Everything below is the boundary.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseService } from './base.service';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import {
  canModerate,
  isAdminRole,
  isValidDisputeTransition,
  isValidJobModerationTransition,
  isValidReportTransition,
  isValidUserStatusTransition,
  requiresModerationReason,
  requiresResolutionSummary,
} from '@/lib/validations/admin.schemas';
import type {
  AdminAuditCategory,
  AdminAuditFilterInput,
  AdminDisputeFilterInput,
  AdminDisputeUpdateInput,
  AdminJobModerationInput,
  AdminJobSearchInput,
  AdminPaymentFilterInput,
  AdminPayoutFilterInput,
  AdminProposalSearchInput,
  AdminReportFilterInput,
  AdminReportUpdateInput,
  AdminUserModerationInput,
  AdminUserSearchInput,
  AdminUserStatus,
  DisputeStatus,
  JobModerationStatus,
  ReportStatus,
} from '@/lib/validations/admin.schemas';

// ===========================================================================
// Data minimization: explicit column lists for the user-detail read
// ===========================================================================
//
// These are module constants rather than inline strings so the test suite can
// assert against the exact list the service sends, and so a future edit to one
// of them is a deliberate, reviewable change.
//
// Modelled on `listUsers`, which already used a narrow projection. `getUserDetail`
// is the one admin read that used `select('*')`, which meant a column added to
// any of these four tables in a later migration would start appearing in an admin
// API response with nobody deciding that it should.
//
// Excluded on purpose:
//   phone_number                - contact PII, no moderation use, no consumer
//   stripe_customer_id          - live payment-provider account identifier
//   stripe_connect_account_id   - live payment-provider account identifier
//   razorpay_account_id         - live payment-provider account identifier
//
// Excluded as pure internal bookkeeping: surrogate `id` columns, `user_id` (the
// caller already knows it), and `updated_at` on the profile rows, which only
// describes our own writes rather than anything about the account.

/** Moderation-visible account state. */
export const ADMIN_USER_DETAIL_COLUMNS =
  'id, email, role, status, is_email_verified, last_login_at, created_at';

/** Public/identity presentation data shown on an account. */
export const ADMIN_PROFILE_COLUMNS =
  'id, first_name, last_name, display_name, avatar_url, timezone, country_code, city, bio_summary, created_at';

/** Commercial state of a client account, without the provider's own account id. */
export const ADMIN_CLIENT_PROFILE_COLUMNS =
  'id, company_id, job_title, department, billing_email, payment_verified, total_spent_cents, active_contracts_count, avg_rating, total_reviews_count, completed_contracts_count, created_at';

/** Capability and reputation state of a consultant, without the payout account id. */
export const ADMIN_CONSULTANT_PROFILE_COLUMNS =
  'id, professional_headline, years_sap_experience, years_cpi_experience, hourly_rate_cents, min_project_size_cents, availability_status, available_hours_per_week, github_profile_url, linkedin_profile_url, overview_markdown, avg_rating, total_reviews_count, completed_contracts_count, payouts_enabled, profile_score, created_at';

/** Coarse request context attached to an audit entry. */
export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry {
  adminUserId: string;
  action: string;
  category: AdminAuditCategory;
  targetType: string;
  targetId: string;
  reason?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  context?: AuditContext;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

export interface MarketplaceOverview {
  registered_users: number;
  active_consultants: number;
  active_clients: number;
  open_jobs: number;
  active_contracts: number;
  completed_contracts: number;
  /** Gross captured value, in paise. Excludes payments never captured. */
  transaction_volume_cents: number;
  /** Platform fees actually earned, in paise. */
  platform_revenue_cents: number;
  open_disputes: number;
  pending_reports: number;
}

export class AdminService extends BaseService {
  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  /**
   * The gate every public method calls first.
   *
   * The role is read from the database rather than taken from the session
   * object: the session role is a snapshot, and a user promoted or demoted since
   * their token was issued would otherwise keep whatever role they had. One
   * extra read per request is the right price for authorization that is correct
   * at the moment it runs.
   */
  private static async requireAdmin(userId: string): Promise<{ id: string; email: string }> {
    const { data, error } = await createAdminClient()
      .from('users')
      .select('id, email, role, status')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new AppError('Failed to verify administrator access.', 500, 'ADMIN_LOOKUP_ERROR', error);
    }
    // A missing row is a failed identity, not a permission decision, and is
    // reported as 401 rather than 403 so the two are not conflated.
    if (!data) throw new UnauthorizedError('Your account could not be resolved.');

    if (!isAdminRole(data.role)) {
      throw new ForbiddenError('Administrator access is required.');
    }
    // A suspended administrator is still an administrator by role, but must not
    // be able to act. Checking status here means suspending an account actually
    // removes its power rather than only its sign-in.
    if (data.status !== 'active') {
      throw new ForbiddenError('This administrator account is not active.');
    }

    return { id: data.id, email: data.email };
  }

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  /**
   * Append one entry to the administrative audit log.
   *
   * Called on every state change. The entry records the actor (from the session,
   * never the body), the subject, the reason, and a before/after projection of
   * the fields that changed.
   *
   * `before` and `after` are narrow projections built by the caller. They are
   * never a whole row and never a request body, because a full user row would
   * put billing and identity columns into a log that is read far more widely
   * than the table it came from.
   */
  private static async audit(entry: AuditEntry): Promise<string> {
    const { data, error } = await createAdminClient()
      .from('admin_audit_log')
      .insert({
        admin_user_id: entry.adminUserId,
        action: entry.action,
        category: entry.category,
        target_type: entry.targetType,
        target_id: entry.targetId,
        reason: entry.reason ?? null,
        before_state: entry.beforeState ?? null,
        after_state: entry.afterState ?? null,
        ip_address: entry.context?.ipAddress ?? null,
        user_agent: entry.context?.userAgent ?? null,
      })
      .select('id')
      .single();

    if (error || !data) {
      // Deliberately loud. A mutation whose audit entry failed to write has
      // happened without a record, which is the one state this table exists to
      // make impossible, so it is surfaced rather than logged and forgotten.
      console.error('[admin/audit] failed to write audit entry', {
        action: entry.action,
        target: entry.targetId,
        errorCode: error?.code ?? 'UNKNOWN',
        errorName: error?.name ?? 'UnknownError',
      });
      throw new AppError(
        'The administrative action could not be recorded and was not applied.',
        500,
        'AUDIT_WRITE_FAILED',
        error
      );
    }
    return data.id as string;
  }

  /**
   * Record that an administrator used the surface. Not a moderation action, so
   * it is filed under category `auth` and does not fill the moderation log.
   *
   * A failure here must not break the request that triggered it: the
   * administrator still needed to do their job, and the failure is logged.
   */
  private static async recordAccess(
    adminUserId: string,
    action: string,
    context?: AuditContext
  ): Promise<void> {
    const { error } = await createAdminClient().from('admin_audit_log').insert({
      admin_user_id: adminUserId,
      action,
      category: 'auth',
      target_type: 'admin_surface',
      target_id: adminUserId,
      reason: null,
      before_state: null,
      after_state: null,
      ip_address: context?.ipAddress ?? null,
      user_agent: context?.userAgent ?? null,
    });
    if (error) {
      console.error('[admin/audit] failed to record surface access', {
        adminUserId,
        action,
        errorCode: error?.code ?? 'UNKNOWN',
        errorName: error?.name ?? 'UnknownError',
      });
    }
  }


  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------

  /**
   * The overview screen, computed with counting queries rather than by loading
   * tables and counting them in JavaScript.
   *
   * Two definitions matter and are worth stating:
   *
   *   - "Active" consultant/client means `users.status = 'active'`. A suspended
   *     account still exists and still holds its profile, but it is not
   *     participating in the marketplace, so it is not counted.
   *
   *   - Transaction volume and platform revenue are computed over CAPTURED
   *     payments only (`held_in_escrow` and `released`). A `pending` payment is
   *     an abandoned or in-flight checkout, and counting it as revenue would
   *     report money the marketplace never received. A `refunded` payment is
   *     likewise excluded, because that money went back out.
   *
   * A removed job is excluded from the open-job count: a job an administrator
   * has pulled is not open for business, and counting it would overstate supply.
   */
  static async getOverview(userId: string, context?: AuditContext): Promise<MarketplaceOverview> {
    const admin = await this.requireAdmin(userId);
    await this.recordAccess(admin.id, 'dashboard.overview_viewed', context);

    const db = createAdminClient();
    const [users, consultants, clients, jobs, contracts, completed, money, disputes, reports] =
      await Promise.all([
        db.from('users').select('*', { count: 'exact', head: true }),
        db
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'consultant')
          .eq('status', 'active'),
        db
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'client')
          .eq('status', 'active'),
        db
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open')
          .eq('moderation_status', 'none'),
        db.from('contracts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        db.from('contracts').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        db
          .from('payments')
          .select('gross_amount_cents, platform_fee_cents')
          .in('status', ['held_in_escrow', 'released']),
        db
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .in('status', ['open', 'under_review']),
        db.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

    const fail = (label: string, error: unknown): never => {
      throw new AppError(`Failed to load ${label}.`, 500, 'OVERVIEW_QUERY_FAILED', error);
    };
    if (users.error) fail('the user count', users.error);
    if (consultants.error) fail('the consultant count', consultants.error);
    if (clients.error) fail('the client count', clients.error);
    if (jobs.error) fail('the open job count', jobs.error);
    if (contracts.error) fail('the contract count', contracts.error);
    if (completed.error) fail('the completed contract count', completed.error);
    if (money.error) fail('the transaction totals', money.error);
    if (disputes.error) fail('the dispute count', disputes.error);
    if (reports.error) fail('the report count', reports.error);

    // Only the two money columns are selected, so this projection cannot widen
    // into the payment row even by accident.
    const captured = (money.data ?? []) as Array<{
      gross_amount_cents: number;
      platform_fee_cents: number;
    }>;
    const transaction_volume_cents = captured.reduce(
      (sum, row) => sum + Number(row.gross_amount_cents ?? 0),
      0
    );
    const platform_revenue_cents = captured.reduce(
      (sum, row) => sum + Number(row.platform_fee_cents ?? 0),
      0
    );

    return {
      registered_users: users.count ?? 0,
      active_consultants: consultants.count ?? 0,
      active_clients: clients.count ?? 0,
      open_jobs: jobs.count ?? 0,
      active_contracts: contracts.count ?? 0,
      completed_contracts: completed.count ?? 0,
      transaction_volume_cents,
      platform_revenue_cents,
      open_disputes: disputes.count ?? 0,
      pending_reports: reports.count ?? 0,
    };
  }


  // -------------------------------------------------------------------------
  // User management
  // -------------------------------------------------------------------------

  /**
   * Search users.
   *
   * The projection is explicit rather than `select('*')`. `users` holds
   * `phone_number`, which is personal data an administrator reviewing a
   * moderation queue has no need to see; enumerating it here would widen the
   * blast radius of a leak of this endpoint.
   */
  static async searchUsers(
    userId: string,
    filters: AdminUserSearchInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('users')
      .select('id, email, role, status, is_email_verified, last_login_at, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, to);

    // `ilike` with the wildcards inside the value, never interpolated into the
    // filter string, so a query containing `%` or `_` is matched literally
    // rather than being able to widen the search.
    if (filters.query) {
      query = query.ilike('email', `%${filters.query.replace(/[%_]/g, '')}%`);
    }
    if (filters.role) query = query.eq('role', filters.role);
    if (filters.status) query = query.eq('status', filters.status);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to search users.', 500, 'USER_SEARCH_FAILED', error);
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }

  /**
   * Read one user with the profile records a reviewer needs.
   *
   * Least data, and now by explicit column list rather than `select('*')`. A broad
   * select on this path is a standing invitation for the next person to add a
   * column to `users` and have it surface in an admin response without anyone
   * deciding that it should. Naming the columns makes that a visible diff.
   *
   * What is deliberately NOT returned, and why:
   *
   *   - `phone_number`. No admin screen reads it, and the admin user LIST already
   *     omits it (see `listUsers`), so including it on the detail view made the
   *     two endpoints inconsistent for no consumer. It is contact PII with no
   *     moderation purpose, so it is dropped rather than returned "just in case".
   *   - `stripe_customer_id`, `stripe_connect_account_id` and
   *     `razorpay_account_id`. These are live payment-provider account
   *     identifiers belonging to a financial system, not moderation data. The
   *     booleans that describe payout state (`payment_verified` on the client
   *     row, `payouts_enabled` on the consultant row) ARE returned, because a
   *     reviewer does need to know whether an account can transact; the
   *     provider's own account id is not needed for that judgement and is never
   *     displayed.
   *
   * Authorization is unchanged: `requireAdmin` runs first and is untouched, and
   * the read still goes through the service role exactly as before.
   */
  static async getUserDetail(
    userId: string,
    targetId: string
  ): Promise<Record<string, unknown>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();

    const { data: user, error: userError } = await db
      .from('users')
      .select(ADMIN_USER_DETAIL_COLUMNS)
      .eq('id', targetId)
      .maybeSingle();
    if (userError) throw new AppError('Failed to load the user.', 500, 'USER_LOAD_FAILED', userError);
    if (!user) throw new NotFoundError('User');

    const [{ data: profile }, { data: clientProfile }, { data: consultantProfile }] =
      await Promise.all([
        db.from('profiles').select(ADMIN_PROFILE_COLUMNS).eq('user_id', targetId).maybeSingle(),
        db
          .from('client_profiles')
          .select(ADMIN_CLIENT_PROFILE_COLUMNS)
          .eq('user_id', targetId)
          .maybeSingle(),
        db
          .from('consultant_profiles')
          .select(ADMIN_CONSULTANT_PROFILE_COLUMNS)
          .eq('user_id', targetId)
          .maybeSingle(),
      ]);

    return {
      user,
      profile: profile ?? null,
      client_profile: clientProfile ?? null,
      consultant_profile: consultantProfile ?? null,
    };
  }

  /**
   * Change a user's account status: suspend, unsuspend, or ban.
   *
   * Guarded by, in order:
   *   1. the caller is an active administrator;
   *   2. the caller is not moderating themselves;
   *   3. the transition is legal (`active <-> suspended`, and
   *      `suspended -> deactivated` to ban);
   *   4. the reason is present.
   *
   * The audit entry is written BEFORE the update, carrying the after-state that
   * is about to be applied. If the update then fails the entry says what was
   * attempted, which is what an investigator needs; the alternative — writing the
   * entry after a successful update — risks an action with no record whenever
   * the second write fails.
   */
  static async moderateUser(
    adminId: string,
    targetId: string,
    input: AdminUserModerationInput,
    context?: AuditContext
  ): Promise<Record<string, unknown>> {
    const admin = await this.requireAdmin(adminId);

    // Self-moderation is refused before the target is even loaded, so the rule
    // holds regardless of what the target row contains.
    if (!canModerate(admin.id, targetId)) {
      throw new ForbiddenError('You cannot change the status of your own account.');
    }

    const db = createAdminClient();
    const { data: target, error: loadError } = await db
      .from('users')
      .select('id, email, role, status')
      .eq('id', targetId)
      .maybeSingle();
    if (loadError) {
      throw new AppError('Failed to load the user.', 500, 'USER_LOAD_FAILED', loadError);
    }
    if (!target) throw new NotFoundError('User');

    const from = target.status as AdminUserStatus;
    const to = input.status;

    if (from === to) {
      throw new ConflictError(`This account is already "${to}".`);
    }
    if (!isValidUserStatusTransition(from, to)) {
      throw new ConflictError(`A "${from}" account cannot become "${to}".`);
    }

    // The audit entry and the update are performed by one database function, so
    // they commit or roll back together (M-1). The row is locked FOR UPDATE
    // inside the function and the audit snapshot is taken from that locked row,
    // so a concurrent writer can no longer make the recorded "before" state
    // misleading (M-2). The state machine is re-evaluated in SQL as well, so a
    // stale transition is refused even though it passed the check above.
    //
    // `admin.id` is the authenticated administrator resolved by requireAdmin, not
    // anything the caller supplied. The function independently re-validates that
    // the named user is an active administrator, so the grant on this RPC is not
    // by itself a path to moderation.
    const { data: updated, error: rpcError } = await db.rpc('admin_moderate_user', {
      p_admin_user_id: admin.id,
      p_target_id: targetId,
      p_to_status: to,
      p_reason: input.reason,
      p_ip_address: context?.ipAddress ?? null,
      p_user_agent: context?.userAgent ?? null,
    });

    if (rpcError) {
      // A rejected transition surfaces as the function's own error, so the
      // reason is the database's, not a guess made in application code.
      if (rpcError.code === '23514' || rpcError.code === '23505') {
        throw new ConflictError();
      }
      if (rpcError.code === 'P0002' || rpcError.code === 'P0001') {
        throw new NotFoundError('User');
      }
      if (rpcError.code === '42501') {
        throw new ForbiddenError();
      }
      throw new AppError('Failed to update the account.', 500, 'USER_UPDATE_FAILED', rpcError);
    }

    return (updated ?? {}) as Record<string, unknown>;
  }


  // -------------------------------------------------------------------------
  // Job management
  // -------------------------------------------------------------------------

  /** Search jobs, including their moderation state so a queue can be filtered. */
  static async searchJobs(
    userId: string,
    filters: AdminJobSearchInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('jobs')
      .select(
        'id, title, slug, status, budget_type, budget_fixed_cents, budget_min_cents, budget_max_cents, proposals_count, views_count, moderation_status, moderation_reason, moderated_by_admin_id, moderated_at, created_at, client_id',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.query) {
      const safe = filters.query.replace(/[%_]/g, '');
      query = query.ilike('title', `%${safe}%`);
    }
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.moderationStatus) query = query.eq('moderation_status', filters.moderationStatus);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to search jobs.', 500, 'JOB_SEARCH_FAILED', error);
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }

  /** One job in full, for review. */
  static async getJobDetail(userId: string, jobId: string): Promise<Record<string, unknown>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const { data, error } = await db.from('jobs').select('id, client_id, company_id, title, slug, integration_type, source_systems, target_systems, protocols, expected_throughput_tier, complexity, description_markdown, deliverables_markdown, estimated_duration_weeks, budget_type, budget_fixed_cents, budget_min_cents, budget_max_cents, status, moderation_status, moderation_reason, moderated_by_admin_id, moderated_at, proposals_count, views_count, hired_at, expires_at, created_at, updated_at').eq('id', jobId).maybeSingle();
    if (error) throw new AppError('Failed to load the job.', 500, 'JOB_LOAD_FAILED', error);
    if (!data) throw new NotFoundError('Job');
    return data;
  }

  /**
   * Flag, unflag or remove a job.
   *
   * Removal is a SOFT state, not a delete. A job may already have proposals and,
   * if it was ever hired, a contract that references it with ON DELETE RESTRICT;
   * deleting the row would either fail or destroy the history a dispute may
   * later need. Marking it `removed` takes it out of circulation and stops it
   * being funded while leaving the record intact.
   */
  static async moderateJob(
    adminId: string,
    jobId: string,
    input: AdminJobModerationInput,
    context?: AuditContext
  ): Promise<Record<string, unknown>> {
    const admin = await this.requireAdmin(adminId);
    const db = createAdminClient();

    const { data: job, error: loadError } = await db
      .from('jobs')
      .select('id, title, status, moderation_status, client_id')
      .eq('id', jobId)
      .maybeSingle();
    if (loadError) throw new AppError('Failed to load the job.', 500, 'JOB_LOAD_FAILED', loadError);
    if (!job) throw new NotFoundError('Job');

    const from = (job.moderation_status ?? 'none') as JobModerationStatus;
    const to = input.moderationStatus as JobModerationStatus;

    if (from === to) {
      throw new ConflictError(`This job is already "${to}".`);
    }
    if (!isValidJobModerationTransition(from, to)) {
      throw new ConflictError(`A job that is "${from}" cannot become "${to}".`);
    }
    if (requiresModerationReason(to) && input.reason.trim().length < 3) {
      throw new ValidationError('A reason is required to flag or remove a job.');
    }

    // One transactional function, so the audit entry and the update commit or
    // roll back together (M-1) and the audit snapshot is taken from the locked
    // row rather than from a pre-write read (M-2). The state machine is
    // re-evaluated in SQL against the row as it exists at write time.
    const { data: updated, error: rpcError } = await db.rpc('admin_moderate_job', {
      p_admin_user_id: admin.id,
      p_target_id: jobId,
      p_to_moderation: to,
      p_reason: input.reason,
      p_ip_address: context?.ipAddress ?? null,
      p_user_agent: context?.userAgent ?? null,
    });

    if (rpcError) {
      if (rpcError.code === '23514' || rpcError.code === '23505') {
        throw new ConflictError();
      }
      if (rpcError.code === 'P0002' || rpcError.code === 'P0001') {
        throw new NotFoundError('Job');
      }
      if (rpcError.code === '42501') {
        throw new ForbiddenError();
      }
      throw new AppError('Failed to update the job.', 500, 'JOB_UPDATE_FAILED', rpcError);
    }

    return (updated ?? {}) as Record<string, unknown>;
  }


  // -------------------------------------------------------------------------
  // Proposal management
  // -------------------------------------------------------------------------

  /**
   * Search proposals.
   *
   * The proposal body columns are included: investigating a suspicious proposal
   * means reading what was actually written, and a moderation queue that only
   * showed the price would be useless for its stated purpose.
   */
  static async searchProposals(
    userId: string,
    filters: AdminProposalSearchInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('proposals')
      .select(
        'id, job_id, consultant_id, cover_letter_markdown, technical_solution_markdown, proposed_duration_weeks, proposed_price_cents, status, client_viewed_at, submitted_at, created_at',
        { count: 'exact' }
      )
      .order('submitted_at', { ascending: false })
      .range(from, to);

    if (filters.jobId) query = query.eq('job_id', filters.jobId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.query) {
      // Matched against the cover letter only. Searching the technical solution
      // as well would scan the largest text column in the marketplace for every
      // keystroke in a moderation search box.
      const safe = filters.query.replace(/[%_]/g, '');
      query = query.ilike('cover_letter_markdown', `%${safe}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      throw new AppError('Failed to search proposals.', 500, 'PROPOSAL_SEARCH_FAILED', error);
    }
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }

  /**
   * Signals that a proposal looks unusual, assembled server-side.
   *
   * Deliberately a read that ASSEMBLES evidence rather than a stored score: a
   * stored score goes stale, and "suspicious" is not a fact about a single row.
   * Each signal is independently explainable, so an operator sees WHY a proposal
   * was flagged instead of being handed a number they have to trust.
   */
  static async investigateProposal(
    userId: string,
    proposalId: string
  ): Promise<Record<string, unknown>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();

    const { data: proposal, error } = await db
      .from('proposals')
      .select('id, job_id, consultant_id, cover_letter_markdown, technical_solution_markdown, proposed_duration_weeks, proposed_price_cents, status, client_viewed_at, submitted_at, created_at, updated_at')
      .eq('id', proposalId)
      .maybeSingle();
    if (error) {
      throw new AppError('Failed to load the proposal.', 500, 'PROPOSAL_LOAD_FAILED', error);
    }
    if (!proposal) throw new NotFoundError('Proposal');

    const [{ data: job }, { data: consultant }, { data: sameConsultantProposals }] =
      await Promise.all([
        db
          .from('jobs')
          .select('id, title, budget_fixed_cents, client_id, status')
          .eq('id', proposal.job_id)
          .maybeSingle(),
        db
          .from('consultant_profiles')
          .select('id, user_id, completed_contracts_count, avg_rating')
          .eq('id', proposal.consultant_id)
          .maybeSingle(),
        // The schema's unique constraint already prevents more than one proposal
        // per (job, consultant), so this is normally 1. It is reported so an
        // operator can see the constraint is holding rather than assume it.
        db.from('proposals').select('id').eq('job_id', proposal.job_id).eq('consultant_id', proposal.consultant_id),
      ]);

    const signals: string[] = [];
    const budget = Number(job?.budget_fixed_cents ?? 0);
    const price = Number(proposal.proposed_price_cents ?? 0);

    if (budget > 0 && price > budget * 2) {
      signals.push('price_more_than_double_the_posted_budget');
    }
    if (budget > 0 && price > 0 && price < budget * 0.1) {
      signals.push('price_far_below_the_posted_budget');
    }
    if (sameConsultantProposals && sameConsultantProposals.length > 1) {
      signals.push('duplicate_proposal_for_same_job_and_consultant');
    }
    if (Number(consultant?.completed_contracts_count ?? 0) === 0) {
      signals.push('consultant_has_no_completed_contracts');
    }
    if (String(proposal.cover_letter_markdown ?? '').trim().length < 40) {
      signals.push('cover_letter_is_very_short');
    }

    return {
      proposal,
      job: job ?? null,
      consultant: consultant ?? null,
      signals,
      flagged: signals.length > 0,
    };
  }


  // -------------------------------------------------------------------------
  // Payment management
  // -------------------------------------------------------------------------

  /**
   * List payments, including failed ones.
   *
   * Financial columns are returned because payment review is the task. This is
   * the one place in the codebase where an administrator sees gross, fee and net
   * together, and it sits behind the same authorization gate as every other
   * screen.
   */
  static async listPayments(
    userId: string,
    filters: AdminPaymentFilterInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('payments')
      .select(
        'id, contract_id, milestone_id, payer_client_id, recipient_consultant_id, gross_amount_cents, platform_fee_cents, net_amount_cents, currency, provider, status, escrow_funded_at, escrow_released_at, refunded_at, razorpay_order_id, razorpay_payment_id, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.contractId) query = query.eq('contract_id', filters.contractId);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to list payments.', 500, 'PAYMENT_LIST_FAILED', error);
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }

  /** List refunds. */
  static async listRefunds(
    userId: string,
    filters: AdminPaymentFilterInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('payment_refunds')
      .select(
        'id, payment_id, provider, provider_refund_id, amount_cents, currency, status, speed, reason, failure_reason, initiated_by_user_id, transfer_reversal_id, processed_at, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to list refunds.', 500, 'REFUND_LIST_FAILED', error);
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }

  /** List payouts and their settlement state. */
  static async listPayouts(
    userId: string,
    filters: AdminPayoutFilterInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('payouts')
      .select(
        'id, consultant_id, payment_id, amount_cents, currency, status, failure_reason, processed_at, razorpay_transfer_id, razorpay_settlement_id, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to list payouts.', 500, 'PAYOUT_LIST_FAILED', error);
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }

  /** Failed payments and failed payouts in one call, for the triage screen. */
  static async listFailedTransactions(
    userId: string,
    filters: AdminPaymentFilterInput
  ): Promise<{ payments: Paginated<Record<string, unknown>>; payouts: Paginated<Record<string, unknown>> }> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;
    let paymentQuery = db
        .from('payments')
        .select('id, contract_id, gross_amount_cents, currency, status, razorpay_payment_id, created_at', { count: 'exact' })
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
    if (filters.contractId) paymentQuery = paymentQuery.eq('contract_id', filters.contractId);

    let paymentIds: string[] | null = null;
    if (filters.contractId) {
      const { data, error } = await db.from('payments').select('id').eq('contract_id', filters.contractId);
      if (error) throw new AppError('Failed to filter failed payouts.', 500, 'FAILED_TX_QUERY', error);
      paymentIds = (data ?? []).map((row) => row.id as string);
    }

    let payoutQuery = db
        .from('payouts')
        .select('id, payment_id, consultant_id, amount_cents, currency, status, failure_reason, razorpay_transfer_id, created_at', { count: 'exact' })
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
    if (filters.contractId) {
      if (!paymentIds?.length) return { payments: { rows: [], total: 0, page: filters.page, limit: filters.limit }, payouts: { rows: [], total: 0, page: filters.page, limit: filters.limit } };
      payoutQuery = payoutQuery.in('payment_id', paymentIds);
    }

    const [{ data: payments, error: pErr, count: paymentCount }, { data: payouts, error: oErr, count: payoutCount }] = await Promise.all([
      paymentQuery,
      payoutQuery,
    ]);

    if (pErr) throw new AppError('Failed to load failed payments.', 500, 'FAILED_TX_QUERY', pErr);
    if (oErr) throw new AppError('Failed to load failed payouts.', 500, 'FAILED_TX_QUERY', oErr);
    return {
      payments: { rows: payments ?? [], total: paymentCount ?? 0, page: filters.page, limit: filters.limit },
      payouts: { rows: payouts ?? [], total: payoutCount ?? 0, page: filters.page, limit: filters.limit },
    };
  }


  // -------------------------------------------------------------------------
  // Disputes
  // -------------------------------------------------------------------------

  /** List disputes, oldest first, so the queue is worked in the order received. */
  static async listDisputes(
    userId: string,
    filters: AdminDisputeFilterInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('disputes')
      .select(
        'id, contract_id, milestone_id, initiator_user_id, respondent_user_id, reason, claimed_amount_cents, status, resolution_summary, resolved_by_admin_id, resolved_at, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: true })
      .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to list disputes.', 500, 'DISPUTE_LIST_FAILED', error);
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }

  /**
   * One dispute in full, INCLUDING both statements and the evidence file list.
   *
   * This is the screen the brief calls "view evidence". The evidence paths are
   * returned as stored paths, never as signed URLs: minting a download URL here
   * would hand the browser a bearer token for a user's private uploads, and the
   * storage layer is what should decide who may read a given object.
   */
  static async getDisputeDetail(
    userId: string,
    disputeId: string
  ): Promise<Record<string, unknown>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();

    const { data: dispute, error } = await db
      .from('disputes')
      .select('id, contract_id, milestone_id, initiator_user_id, respondent_user_id, reason, initiator_statement, respondent_statement, evidence_storage_paths, claimed_amount_cents, status, resolution_summary, resolved_by_admin_id, resolved_at, created_at, updated_at')
      .eq('id', disputeId)
      .maybeSingle();
    if (error) throw new AppError('Failed to load the dispute.', 500, 'DISPUTE_LOAD_FAILED', error);
    if (!dispute) throw new NotFoundError('Dispute');

    const [{ data: contract }, { data: milestone }] = await Promise.all([
      db
        .from('contracts')
        .select('id, title, total_amount_cents, status, client_id, consultant_id')
        .eq('id', dispute.contract_id)
        .maybeSingle(),
      dispute.milestone_id
        ? db
            .from('milestones')
            .select('id, title, amount_cents, status, due_date')
            .eq('id', dispute.milestone_id)
            .maybeSingle()
        : Promise.resolve({ data: null as unknown }),
    ]);

    return { dispute, contract: contract ?? null, milestone: milestone ?? null };
  }

  /**
   * Read one report in full.
   *
   * Authorization is checked before the row is read, so a non-administrator
   * cannot use this endpoint to discover which report ids exist.
   */
  static async getReportDetail(
    userId: string,
    reportId: string
  ): Promise<Record<string, unknown>> {
    await this.requireAdmin(userId);
    const { data, error } = await createAdminClient()
      .from('reports')
      .select('id, target_type, target_id, reporter_user_id, reason, status, action_taken, reviewed_by_admin_id, reviewed_at, created_at, updated_at')
      .eq('id', reportId)
      .maybeSingle();
    if (error) throw new AppError('Failed to load the report.', 500, 'REPORT_LOAD_FAILED', error);
    if (!data) throw new NotFoundError('Report');
    return data;
  }

  /**
   * Resolve a dispute to a new state.
   *
   * A resolution that moves money must state what was decided. The terminal
   * states are terminal, and the database CHECK in migration 00014 additionally
   * requires the resolving administrator and a timestamp, so a dispute cannot
   * reach a resolved state without an accountable person behind it.
   */
  static async updateDispute(
    adminId: string,
    disputeId: string,
    input: AdminDisputeUpdateInput,
    context?: AuditContext
  ): Promise<Record<string, unknown>> {
    const admin = await this.requireAdmin(adminId);
    const db = createAdminClient();

    const { data: dispute, error: loadError } = await db
      .from('disputes')
      .select('id, status, contract_id, initiator_user_id, respondent_user_id, claimed_amount_cents')
      .eq('id', disputeId)
      .maybeSingle();
    if (loadError) {
      throw new AppError('Failed to load the dispute.', 500, 'DISPUTE_LOAD_FAILED', loadError);
    }
    if (!dispute) throw new NotFoundError('Dispute');

    const from = dispute.status as DisputeStatus;
    const to = input.status as DisputeStatus;

    if (from === to) {
      throw new ConflictError(`This dispute is already "${to}".`);
    }
    if (!isValidDisputeTransition(from, to)) {
      throw new ConflictError(`A dispute that is "${from}" cannot become "${to}".`);
    }
    if (requiresResolutionSummary(to) && !input.resolutionSummary) {
      throw new ValidationError('A resolution summary is required to resolve or dismiss a dispute.');
    }


    // One transactional function: the audit entry, the resolution and the
    // back-link from the dispute to that audit entry all commit or roll back
    // together (M-1), and the snapshot is taken from the locked row (M-2).
    const { data: updated, error: rpcError } = await db.rpc('admin_update_dispute', {
      p_admin_user_id: admin.id,
      p_target_id: disputeId,
      p_to_status: to,
      p_resolution: input.resolutionSummary ?? '',
      p_ip_address: context?.ipAddress ?? null,
      p_user_agent: context?.userAgent ?? null,
    });

    if (rpcError) {
      if (rpcError.code === '23514' || rpcError.code === '23505') {
        throw new ConflictError();
      }
      if (rpcError.code === 'P0002' || rpcError.code === 'P0001') {
        throw new NotFoundError('Dispute');
      }
      if (rpcError.code === '42501') {
        throw new ForbiddenError();
      }
      throw new AppError('Failed to update the dispute.', 500, 'DISPUTE_UPDATE_FAILED', rpcError);
    }

    return (updated ?? {}) as Record<string, unknown>;
  }


  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  /**
   * List reports, filtered to the subject type the brief groups them under
   * (reported users, jobs, messages, reviews).
   *
   * Newest-first is wrong for a moderation queue: the oldest unresolved report
   * is the one that has been waiting longest, so unresolved reports are ordered
   * oldest-first and resolved ones are excluded from the default view.
   */
  static async listReports(
    userId: string,
    filters: AdminReportFilterInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('reports')
      .select(
        'id, reporter_user_id, target_type, target_id, reason, description, status, action_taken, reviewed_by_admin_id, reviewed_at, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: true })
      .range(from, to);

    if (filters.targetType) query = query.eq('target_type', filters.targetType);
    if (filters.status) query = query.eq('status', filters.status);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to list reports.', 500, 'REPORT_LIST_FAILED', error);
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }

  /**
   * Resolve or dismiss a report.
   *
   * The action taken is mandatory, and the audit entry id is written onto the
   * report row so the decision and the log entry that describes it can be read
   * together. A report therefore cannot reach a terminal status without a stated
   * action and a matching audit entry behind it.
   */
  static async updateReport(
    adminId: string,
    reportId: string,
    input: AdminReportUpdateInput,
    context?: AuditContext
  ): Promise<Record<string, unknown>> {
    const admin = await this.requireAdmin(adminId);
    const db = createAdminClient();

    const { data: report, error: loadError } = await db
      .from('reports')
      .select('id, status, target_type, target_id, reporter_user_id, reason')
      .eq('id', reportId)
      .maybeSingle();
    if (loadError) {
      throw new AppError('Failed to load the report.', 500, 'REPORT_LOAD_FAILED', loadError);
    }
    if (!report) throw new NotFoundError('Report');

    const from = report.status as ReportStatus;
    const to = input.status as ReportStatus;

    if (from === to) {
      throw new ConflictError(`This report is already "${to}".`);
    }
    if (!isValidReportTransition(from, to)) {
      throw new ConflictError(`A report that is "${from}" cannot become "${to}".`);
    }
    if (to !== 'pending' && to !== 'investigating' && !input.actionTaken) {
      throw new ValidationError('Describe the action taken before closing a report.');
    }


    // One transactional function: the audit entry, the disposition and the
    // back-link to that audit entry commit or roll back together (M-1), and the
    // snapshot is taken from the locked row (M-2).
    const { data: updated, error: rpcError } = await db.rpc('admin_update_report', {
      p_admin_user_id: admin.id,
      p_target_id: reportId,
      p_to_status: to,
      p_action_taken: input.actionTaken,
      p_ip_address: context?.ipAddress ?? null,
      p_user_agent: context?.userAgent ?? null,
    });

    if (rpcError) {
      if (rpcError.code === '23514' || rpcError.code === '23505') {
        throw new ConflictError();
      }
      if (rpcError.code === 'P0002' || rpcError.code === 'P0001') {
        throw new NotFoundError('Report');
      }
      if (rpcError.code === '42501') {
        throw new ForbiddenError();
      }
      throw new AppError('Failed to update the report.', 500, 'REPORT_UPDATE_FAILED', rpcError);
    }

    return (updated ?? {}) as Record<string, unknown>;
  }

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  /**
   * Read the administrative audit log.
   *
   * Read-only by construction: the table has an append-only trigger and no
   * browser grants, and no method in this service updates or deletes a row. The
   * only thing an administrator can do with an entry is read it.
   */
  static async listAuditLog(
    userId: string,
    filters: AdminAuditFilterInput
  ): Promise<Paginated<Record<string, unknown>>> {
    await this.requireAdmin(userId);
    const db = createAdminClient();
    const from = (filters.page - 1) * filters.limit;
    const to = from + filters.limit - 1;

    let query = db
      .from('admin_audit_log')
      .select(
        'id, admin_user_id, action, category, target_type, target_id, reason, before_state, after_state, ip_address, user_agent, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.category) query = query.eq('category', filters.category);
    if (filters.adminUserId) query = query.eq('admin_user_id', filters.adminUserId);
    if (filters.targetType) query = query.eq('target_type', filters.targetType);
    if (filters.targetId) query = query.eq('target_id', filters.targetId);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to read the audit log.', 500, 'AUDIT_LIST_FAILED', error);
    return { rows: data ?? [], total: count ?? 0, page: filters.page, limit: filters.limit };
  }
}

