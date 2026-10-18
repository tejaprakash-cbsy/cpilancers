import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateVerifiedSupabaseContext = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockCreateAdminClient = vi.fn(() => ({ from: mockFrom }));

vi.mock('@/lib/supabase/context', () => ({
  createVerifiedSupabaseContext: () => mockCreateVerifiedSupabaseContext(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

import { GET } from '@/app/api/auth/me/route';

const TEST_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/auth/me route tests', () => {
  it('returns 401 UNAUTHORIZED when supabase context has an error', async () => {
    mockCreateVerifiedSupabaseContext.mockResolvedValue({
      error: new Error('Invalid token or session expired'),
      data: null,
    });

    const res = await GET();
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required.',
    });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED when userClaims has no id', async () => {
    mockCreateVerifiedSupabaseContext.mockResolvedValue({
      error: null,
      data: { userClaims: null },
    });

    const res = await GET();
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 NOT_FOUND when the user record does not exist in the database', async () => {
    mockCreateVerifiedSupabaseContext.mockResolvedValue({
      error: null,
      data: { userClaims: { id: TEST_USER_ID } },
    });
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Row not found' } });

    const res = await GET();
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'User record not found.',
    });
  });

  it('returns 200 with strictly minimized user fields for an authenticated user', async () => {
    const userData = {
      id: TEST_USER_ID,
      email: 'consultant@example.com',
      role: 'consultant',
      status: 'active',
      is_email_verified: true,
      phone_number: null,
      last_login_at: '2026-10-16T12:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-10-16T12:00:00.000Z',
    };

    mockCreateVerifiedSupabaseContext.mockResolvedValue({
      error: null,
      data: { userClaims: { id: TEST_USER_ID } },
    });
    mockSingle.mockResolvedValue({ data: userData, error: null });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(userData);

    // Verify data minimization query: only permitted columns are requested
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockSelect).toHaveBeenCalledWith(
      'id, email, role, status, is_email_verified, phone_number, last_login_at, created_at, updated_at'
    );
    expect(mockEq).toHaveBeenCalledWith('id', TEST_USER_ID);
  });
});
