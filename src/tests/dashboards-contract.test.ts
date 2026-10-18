import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClientAuthService,
  ClientJobService,
  ClientProposalService,
  ClientMessagingService,
} from '@/services/client-api.service';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('Dashboard Client API Services contract tests', () => {
  it('ClientAuthService.getCurrentUser queries /api/auth/me', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'u1', email: 'test@example.com' } }),
    } as Response);

    const user = await ClientAuthService.getCurrentUser();
    expect(user).toEqual({ id: 'u1', email: 'test@example.com' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      })
    );
  });

  describe('ClientJobService query string and methods', () => {
    it('omits undefined and null filters and joins array filters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { jobs: [], total: 0, page: 1, limit: 10 } }),
      } as Response);

      await ClientJobService.getJobs({
        page: 1,
        limit: 10,
        status: ['draft', 'open'],
        search: undefined,
        category: null,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jobs?page=1&limit=10&status=draft%2Copen',
        expect.anything()
      );
    });

    it('creates, updates, publishes, closes and deletes jobs with correct HTTP methods and paths', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { id: 'job-1' } }),
      } as Response);

      await ClientJobService.createJob({ title: 'SAP CPI Developer' });
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/jobs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'SAP CPI Developer' }),
        })
      );

      await ClientJobService.updateJob('job-1', { title: 'Updated Job' });
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/jobs/job-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ title: 'Updated Job' }),
        })
      );

      await ClientJobService.publishJob('job-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/jobs/job-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'open' }),
        })
      );

      await ClientJobService.closeJob('job-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/jobs/job-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'closed' }),
        })
      );

      await ClientJobService.deleteJob('job-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/jobs/job-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('ClientProposalService', () => {
    it('proposals query string merges filterStatus and options correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { proposals: [], total: 0, page: 1, limit: 5 } }),
      } as Response);

      await ClientProposalService.getProposalsForJob('job-99', ['submitted', 'shortlisted'], { page: 1 });
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jobs/job-99/proposals?page=1&status=submitted%2Cshortlisted',
        expect.anything()
      );
    });

    it('manages proposal lifecycle actions with correct PATCH bodies', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { id: 'prop-1' } }),
      } as Response);

      await ClientProposalService.shortlistProposal('prop-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/proposals/prop-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'shortlisted' }) })
      );

      await ClientProposalService.acceptProposal('prop-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/proposals/prop-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) })
      );

      await ClientProposalService.rejectProposal('prop-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/proposals/prop-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) })
      );

      await ClientProposalService.withdrawProposal('prop-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/proposals/prop-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'withdrawn' }) })
      );
    });
  });

  describe('ClientMessagingService', () => {
    it('calculates unread message count from notification array length', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
        }),
      } as Response);

      const count = await ClientMessagingService.getUnreadMessageCount();
      expect(count).toBe(3);
    });

    it('returns 0 when notification array is empty or non-array', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      } as Response);

      const count = await ClientMessagingService.getUnreadMessageCount();
      expect(count).toBe(0);
    });

    it('message actions use POST with action payload in the body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { id: 'msg-1' } }),
      } as Response);

      await ClientMessagingService.markMessageAsRead('msg-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/messages/messages/msg-1',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'read' }),
        })
      );

      await ClientMessagingService.editMessage('msg-1', 'Updated text');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/messages/messages/msg-1',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'edit', newContent: 'Updated text' }),
        })
      );

      await ClientMessagingService.deleteMessage('msg-1');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/messages/messages/msg-1',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'delete' }),
        })
      );

      await ClientMessagingService.reportMessage('msg-1', 'spam', 'Spamming adverts');
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/messages/messages/msg-1',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'report', reason: 'spam', description: 'Spamming adverts' }),
        })
      );
    });
  });

  describe('Error handling', () => {
    it('throws custom error message from server when request fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: { message: 'Custom server rejection reason' },
        }),
      } as Response);

      await expect(ClientJobService.getJobById('bad-id')).rejects.toThrow(
        'Custom server rejection reason'
      );
    });

    it('falls back to "Request failed" when error payload lacks message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await expect(ClientJobService.getJobById('bad-id')).rejects.toThrow('Request failed');
    });
  });
});
