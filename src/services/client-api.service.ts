import type { Job, Proposal, User, ClientProfile, ConsultantProfile, Profile, Company, Skill, ConsultantSkill, ConsultantCertification } from '@/types/database';

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
  static deleteJob(id: string) { return request<void>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }); }
}
export class ClientProposalService {
  static createProposal(_userId: string, data: Record<string, unknown>) { return request<Proposal>('/api/proposals', { method: 'POST', body: JSON.stringify(data) }); }
  static getProposalsForJob(jobId: string, _userId: string, filterStatus?: unknown, options?: Record<string, unknown>) { const params = new URLSearchParams(options as Record<string, string>); if (filterStatus) params.set('status', Array.isArray(filterStatus) ? filterStatus.join(',') : String(filterStatus)); return request<{ proposals: Proposal[]; total: number; page: number; limit: number }>(`/api/jobs/${jobId}/proposals?${params}`); }
  static getProposalsByConsultant(_userId: string, options?: Record<string, unknown>) { return request<{ proposals: Proposal[]; total: number; page: number; limit: number }>(`/api/proposals?${new URLSearchParams(options as Record<string, string>).toString()}`); }
  static shortlistProposal(id: string, _userId: string) { return request<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'shortlisted' }) }); }
  static rejectProposal(id: string, _userId: string) { return request<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }); }
  static acceptProposal(id: string, _userId: string) { return request<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }); }
  static withdrawProposal(id: string, _userId: string) { return request<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'withdrawn' }) }); }
}
export class ClientMessagingService {
  static getUserConversations() { return request<unknown[]>('/api/messages/conversations'); }
  static getUnreadMessageCount() { return request<number>('/api/messages/notifications?unread=true'); }
  static getConversationById(id: string) { return request<unknown>(`/api/messages/conversations/${id}`); }
  static getMessages(id: string, page = 1, limit = 50) { return request<unknown[]>(`/api/messages/conversations/${id}/messages?page=${page}&limit=${limit}`); }
  static sendMessage(id: string, content: string) { return request<unknown>(`/api/messages/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) }); }
  static markMessageAsRead(id: string) { return request<void>(`/api/messages/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'read' }) }); }
  static editMessage(id: string, content: string) { return request<unknown>(`/api/messages/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }); }
  static deleteMessage(id: string) { return request<void>(`/api/messages/messages/${id}`, { method: 'POST', body: JSON.stringify({ action: 'delete' }) }); }
  static reportMessage(id: string, reason: string, description: string) { return request<unknown>(`/api/messages/messages/${id}`, { method: 'POST', body: JSON.stringify({ action: 'report', reason, description }) }); }
  static subscribeToConversation() { return { unsubscribe: () => undefined }; }
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
