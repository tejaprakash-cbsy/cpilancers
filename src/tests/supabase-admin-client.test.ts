import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

import { createAdminClient } from '@/lib/supabase/admin';

describe('createAdminClient authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    mockCreateClient.mockReturnValue({ admin: true });
  });

  it('preserves the SDK authorization headers required by privileged Auth and REST calls', () => {
    expect(createAdminClient()).toEqual({ admin: true });
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-secret-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const options = mockCreateClient.mock.calls[0][2] as { global?: { fetch?: unknown } };
    expect(options.global?.fetch).toBeUndefined();
  });

  it('rejects a missing privileged key before constructing a client', () => {
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createAdminClient()).toThrow('Missing Supabase secret key or URL for admin client.');
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
