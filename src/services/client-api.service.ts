import type { Job, Proposal, User, ClientProfile, ConsultantProfile, Profile, Company, Skill, ConsultantSkill, ConsultantCertification } from '@/types/database';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

/** Channel lifecycle states reported by supabase-js realtime. */
export type RealtimeStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR'
  | string;

export interface RealtimeSubscription {
  unsubscribe: () => void;
  status: RealtimeStatus;
}

let browserClient: ReturnType<typeof import('@/lib/supabase/client').createClient> | null = null;

/**
 * Lazily created browser Supabase client for realtime channels.
 *
 * The module is imported statically but the CLIENT is only constructed on first
 * use, and only in a browser. `@/lib/supabase/client` touches `window` inside
 * `createClient()`, never at module scope, so importing it from a server context
 * is inert -- it is the call that is guarded, not the import.
 *
 * This was previously a `require('@/lib/supabase/client')` inside the function.
 * That worked at runtime but resolved the `@/` alias outside the bundler's
 * module graph, which is unresolvable by any other tool reading the source (the
 * test runner could not see it), and required an eslint-disable for
 * no-require-imports.
 */
function getBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error('Realtime messaging is only available in the browser.');
  }
  if (!browserClient) {
    browserClient = createBrowserSupabaseClient();
  }
  return browserClient;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || 'Request failed');
  return body.data as T;
}

export class ClientAuthService { static getCurrentUser() { return request<User>('/api/auth/me'); } }
export class ClientJobService {
  static getJobById(id: string) { return request<Job>(`/api/jobs/${id}`); }
  static getClientIdByUserId(userId: string) { return request<string | null>(`/api/jobs/client/${userId}`); }
  static getJobs(options: Record<string, unknown>) { return request<{ jobs: Job[]; total: number; page: number; limit: number }>(`/api/jobs?${new URLSearchParams(options as Record<string, string>).toString()}`); }
  static createJob(data: Record<string, unknown>) { return request<Job>('/api/jobs', { method: 'POST', body: JSON.stringify(data) }); }
  static updateJob(id: string, data: Record<string, unknown>) { return request<Job>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
  static publishJob(id: string) { return request<void>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) }); }
  static closeJob(id: string) { return request<void>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) }); }
  static deleteJob(id: string) { return request<{ deleted: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' }); }
}
/**
 * Proposal client wrappers.
 *
 * None of these take a `userId`. The API resolves the caller from the session
 * cookie, so a userId argument here was dead weight -- and it forced callers to
 * write `(await AuthService.getCurrentUser())?.id as string`, an unchecked cast
 * that would have sent the literal "undefined" as a user id if the session
 * lookup ever failed. Authorization is the server's job, not the caller's.
 */
export class ClientProposalService {
  static createProposal(data: Record<string, unknown>) { return request<Proposal>('/api/proposals', { method: 'POST', body: JSON.stringify(data) }); }
  static getProposalsForJob(jobId: string, filterStatus?: unknown, options?: Record<string, unknown>) { const params = new URLSearchParams(options as Record<string, string>); if (filterStatus) params.set('status', Array.isArray(filterStatus) ? filterStatus.join(',') : String(filterStatus)); return request<{ proposals: Proposal[]; total: number; page: number; limit: number }>(`/api/jobs/${jobId}/proposals?${params}`); }
  static getProposalsByConsultant(options?: Record<string, unknown>) { return request<{ proposals: Proposal[]; total: number; page: number; limit: number }>(`/api/proposals?${new URLSearchParams(options as Record<string, string>).toString()}`); }
  static shortlistProposal(id: string) { return request<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'shortlisted' }) }); }
  static rejectProposal(id: string) { return request<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }); }
  static acceptProposal(id: string) { return request<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }); }
  static withdrawProposal(id: string) { return request<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'withdrawn' }) }); }
}
// These three hit a route that exports POST only (see
// src/app/api/messages/messages/[messageId]/route.ts). They previously sent
// PATCH, which Next answered with 405 Method Not Allowed, so "mark as read",
// "edit" and "delete" all silently failed at runtime.
export class ClientMessagingService {
  static getUserConversations() { return request<unknown[]>('/api/messages/conversations'); }
  /**
   * `/api/messages/notifications` answers with the unread notification ARRAY, not
   * a count. The wrapper previously typed the response as `number` and handed the
   * array straight to `setUnreadCount`, so the sidebar rendered a stringified
   * array instead of a badge count. The length is derived here.
   *
   * Note this counts unread *notifications*, which is the only unread signal the
   * current API exposes -- there is no unread-messages aggregate endpoint.
   */
  static async getUnreadMessageCount(): Promise<number> {
    const notifications = await request<unknown[]>('/api/messages/notifications');
    return Array.isArray(notifications) ? notifications.length : 0;
  }
  static getConversationById(id: string) { return request<unknown>(`/api/messages/conversations/${id}`); }
  static getMessages(id: string, page = 1, limit = 50) { return request<unknown[]>(`/api/messages/conversations/${id}/messages?page=${page}&limit=${limit}`); }
  static sendMessage(id: string, content: string) { return request<unknown>(`/api/messages/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) }); }
  // The action travels in the request BODY. These four previously issued a bare
  // `POST /api/messages/messages/<id>`, which the route answered with 400
  // "Action is required." because it could only read the action from a URL path
  // segment that does not exist.
  static markMessageAsRead(id: string) { return request<unknown>(`/api/messages/messages/${id}`, { method: 'POST', body: JSON.stringify({ action: 'read' }) }); }
  static editMessage(id: string, content: string) { return request<unknown>(`/api/messages/messages/${id}`, { method: 'POST', body: JSON.stringify({ action: 'edit', newContent: content }) }); }
  static deleteMessage(id: string) { return request<unknown>(`/api/messages/messages/${id}`, { method: 'POST', body: JSON.stringify({ action: 'delete' }) }); }
  static reportMessage(id: string, reason: string, description: string) { return request<unknown>(`/api/messages/messages/${id}`, { method: 'POST', body: JSON.stringify({ action: 'report', reason, description }) }); }

  /**
   * Subscribe to realtime INSERTs on `messages` for one conversation.
   *
   * This replaces a stub that returned `{ unsubscribe: () => undefined }` and so
   * silently never delivered anything.
   *
   * IMPORTANT LIMITATION -- read before relying on this: realtime delivery also
   * requires the `messages` table to be part of the `supabase_realtime`
   * publication. No migration in `supabase/migrations/` performs that
   * `ALTER PUBLICATION supabase_realtime ADD TABLE messages`, so today the
   * channel subscribes successfully but Postgres never pushes a change.
   *
   * The subscription therefore reports its state instead of pretending, and
   * callers must keep working without it: `chat-view.tsx` loads the full message
   * list on open, on conversation change and on manual refresh, which is the
   * current source of truth. Adding the publication is a schema migration and is
   * deliberately out of scope for the pre-audit hardening phase.
   */
  static subscribeToConversation(
    conversationId: string,
    onMessage: (payload: unknown) => void,
    onStatus?: (status: RealtimeStatus) => void
  ): RealtimeSubscription {
    if (typeof window === 'undefined' || !conversationId) {
      return { unsubscribe: () => undefined, status: 'closed' };
    }

    const supabase = getBrowserClient();
    const channelName = `messages:conversation_id=eq.${conversationId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: unknown) => onMessage(payload)
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(
            `[MessagingService] Realtime channel "${channelName}" is "${status}". ` +
              'This is expected until `messages` is added to the `supabase_realtime` publication. ' +
              'Falling back to refresh-based updates.'
          );
        }
        onStatus?.(status);
      });

    let unsubscribed = false;
    return {
      status: 'subscribing',
      unsubscribe() {
        // Guard against a double-unsubscribe: `removeChannel` on an already
        // removed channel logs and leaks the entry from supabase-js' registry.
        if (unsubscribed) return;
        unsubscribed = true;
        try {
          void supabase.removeChannel(channel);
        } catch (error) {
          console.error('[MessagingService] Failed to remove realtime channel:', error);
        }
      },
    };
  }
}

export class ClientProfileService {
  static getProfile() { return request<{ profile: Profile; user: User; clientProfile: ClientProfile | null; consultantProfile: ConsultantProfile | null; company: Company | null; skills: Array<ConsultantSkill & { skill: Skill }>; certifications: ConsultantCertification[]; portfolios: unknown[] }>('/api/profile'); }
  static getClientProfileById(id: string) { return request<{ client: ClientProfile; company: Company | null }>(`/api/profile/clients/${id}`); }
  static getConsultantProfileById(id: string) { return request<{ profile: Profile | null; consultant: ConsultantProfile; skills: unknown[]; certifications: unknown[]; portfolios: unknown[] }>(`/api/profile/consultants/${id}`); }
  static getProfileByUserId(id: string) { return request<Profile>(`/api/profile/users/${id}`); }
  static getCompanyById(id: string) { return request<Company>(`/api/profile/companies/${id}`); }
  static getClientProfileByUserId(id: string) { return request<ClientProfile>(`/api/profile/users/${id}/client`); }
  static getConsultantProfileByUserId(id: string) { return request<ConsultantProfile>(`/api/profile/users/${id}/consultant`); }
  static calculateProfileCompleteness() { return request<{ completeness: number }>('/api/profile/completeness'); }
  static getConsultantSkills(id: string) { return request<Array<ConsultantSkill & { skill: Skill }>>(`/api/profile/consultants/${id}/skills`); }
  static getSkills() { return request<Skill[]>('/api/profile/skills'); }
  static addConsultantSkill(id: string, data: Record<string, unknown>) { return request<ConsultantSkill>(`/api/profile/consultants/${id}/skills`, { method: 'POST', body: JSON.stringify(data) }); }
  static removeConsultantSkill(id: string, skillId: string) { return request<void>(`/api/profile/consultants/${id}/skills/${skillId}`, { method: 'DELETE' }); }
  static getConsultantCertifications(id: string) { return request<ConsultantCertification[]>(`/api/profile/consultants/${id}/certifications`); }
  static addConsultantCertification(id: string, data: Record<string, unknown>) { return request<ConsultantCertification>(`/api/profile/consultants/${id}/certifications`, { method: 'POST', body: JSON.stringify(data) }); }
}
