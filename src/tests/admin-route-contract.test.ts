import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { NotFoundError } from '@/lib/errors';

const auth = { getCurrentUser: vi.fn() };
const admin = {
  listDisputes: vi.fn(),
  getDisputeDetail: vi.fn(),
  updateDispute: vi.fn(),
};

vi.mock('@/services/auth.service', () => ({ AuthService: auth }));
vi.mock('@/services/admin.service', () => ({ AdminService: admin }));

const { GET: getCollection } = await import('@/app/api/admin/disputes/route');
const detailRoute = await import('@/app/api/admin/disputes/[id]/route');

function request(path: string, init?: RequestInit) {
  return new NextRequest(`http://localhost${path}`, init);
}

describe('admin dispute route contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.getCurrentUser.mockResolvedValue({ id: 'admin-1' });
    admin.listDisputes.mockResolvedValue({ rows: [], total: 0, page: 1, limit: 25 });
    admin.getDisputeDetail.mockResolvedValue({ dispute: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    admin.updateDispute.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'under_review' });
  });

  it('requires authentication before collection access', async () => {
    auth.getCurrentUser.mockResolvedValueOnce(null);
    const response = await getCollection(request('/api/admin/disputes'));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
    expect(admin.listDisputes).not.toHaveBeenCalled();
  });

  it('serves the paginated collection for an authenticated caller', async () => {
    const response = await getCollection(request('/api/admin/disputes?page=2&limit=10'));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ page: 1, limit: 25 });
    expect(admin.listDisputes).toHaveBeenCalledWith('admin-1', { page: 2, limit: 10 });
  });

  it('rejects malformed detail IDs before the service lookup', async () => {
    const response = await detailRoute.GET(request('/api/admin/disputes/not-a-uuid'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe('Invalid resource ID.');
    expect(admin.getDisputeDetail).not.toHaveBeenCalled();
  });

  it('returns 404 for a valid but absent detail resource', async () => {
    admin.getDisputeDetail.mockRejectedValueOnce(new NotFoundError('Dispute'));
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const response = await detailRoute.GET(request(`/api/admin/disputes/${id}`));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found.' });
  });

  it('validates PATCH input and allows a valid authorized mutation', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const invalid = await detailRoute.PATCH(request(`/api/admin/disputes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'not-a-status' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(invalid.status).toBe(400);
    expect(admin.updateDispute).not.toHaveBeenCalled();

    const valid = await detailRoute.PATCH(request(`/api/admin/disputes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'under_review' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(valid.status).toBe(200);
    expect(admin.updateDispute).toHaveBeenCalledWith('admin-1', id, { status: 'under_review' }, expect.anything());
  });
});
