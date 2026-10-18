import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { AuthService } from '@/services/auth.service';

const params = {
  email: 'person@example.com',
  password: 'Password123!',
  role: 'consultant' as const,
  firstName: 'Person',
  lastName: 'Example',
};

function query(result: unknown, deleteResult = { error: null }) {
  const deleteBuilder = {
    eq: vi.fn().mockResolvedValue(deleteResult),
  };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockResolvedValue(result),
    delete: vi.fn(() => deleteBuilder),
  };
  return builder;
}

function setup({
  existingUser = null,
  existingUserError = null,
  userInsert = { error: null },
  profileInsert = { error: null },
  userDelete = { error: null },
  authDelete = { error: null },
} = {}) {
  const publicClient = {
    from: vi.fn(),
    auth: {
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: 'auth-user', email: params.email }, session: null },
        error: null,
      }),
    },
  };
  const adminUsers = query({ data: existingUser, error: existingUserError }, userDelete);
  adminUsers.insert.mockResolvedValue(userInsert);
  const adminProfiles = query(profileInsert);
  const adminClient = {
    from: vi.fn((table: string) => table === 'users' ? adminUsers : adminProfiles),
    auth: { admin: { deleteUser: vi.fn().mockResolvedValue(authDelete) } },
  };
  mocks.createClient.mockResolvedValue(publicClient);
  mocks.createAdminClient.mockReturnValue(adminClient);
  return { publicClient, adminUsers, adminProfiles, adminClient };
}

beforeEach(() => vi.clearAllMocks());

describe('AuthService.register duplicate and failure handling', () => {
  it('checks existing accounts with the server-only client', async () => {
    const { publicClient, adminUsers } = setup({ existingUser: { id: 'existing-user' } });

    await expect(AuthService.register(params)).rejects.toMatchObject({ statusCode: 409 });
    expect(adminUsers.select).toHaveBeenCalledWith('id');
    expect(publicClient.auth.signUp).not.toHaveBeenCalled();
  });

  it('maps an enumeration-safe signup response without a user to a conflict', async () => {
    const state = setup();
    state.publicClient.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });

    await expect(AuthService.register(params)).rejects.toMatchObject({ statusCode: 409 });
    expect(state.adminUsers.insert).not.toHaveBeenCalled();
  });

  it('maps a duplicate users insert to a conflict after cleaning up Auth', async () => {
    const state = setup({ userInsert: { error: { code: '23505', message: 'duplicate key' } } });

    await expect(AuthService.register(params)).rejects.toMatchObject({ statusCode: 409 });
    expect(state.adminClient.auth.admin.deleteUser).toHaveBeenCalledWith('auth-user');
  });

  it('attempts both cleanup operations and keeps a controlled error when cleanup reports failures', async () => {
    const state = setup({
      profileInsert: { error: { code: 'PROFILE_INSERT_FAILED', status: 500 } },
      userDelete: { error: { code: 'USER_DELETE_FAILED', status: 500 } },
      authDelete: { error: { code: 'AUTH_DELETE_FAILED', status: 500 } },
    });

    await expect(AuthService.register(params)).rejects.toMatchObject({ statusCode: 500 });
    expect(state.adminUsers.delete).toHaveBeenCalledTimes(1);
    expect(state.adminClient.auth.admin.deleteUser).toHaveBeenCalledWith('auth-user');
  });

  it('returns a controlled 503 when the existing-user check fails', async () => {
    setup({ existingUserError: { code: 'PGRST500', message: 'temporary database failure' } });

    await expect(AuthService.register(params)).rejects.toMatchObject({
      statusCode: 503,
      code: 'AUTH_REGISTRATION_UNAVAILABLE',
    });
  });

  it('maps a users permission failure to the controlled registration-unavailable response', async () => {
    setup({ existingUserError: { code: '42501', message: 'permission denied for table users' } });

    await expect(AuthService.register(params)).rejects.toMatchObject({
      statusCode: 503,
      code: 'AUTH_REGISTRATION_UNAVAILABLE',
    });
  });

  it('returns a controlled 503 when the admin client is not configured', async () => {
    mocks.createAdminClient.mockImplementation(() => {
      throw new Error('Missing Supabase secret key or URL for admin client.');
    });
    mocks.createClient.mockResolvedValue({ from: vi.fn(), auth: { signUp: vi.fn() } });

    await expect(AuthService.register(params)).rejects.toMatchObject({
      statusCode: 503,
      code: 'AUTH_CONFIGURATION_ERROR',
    });
  });

  it('maps Supabase duplicate signup errors to a conflict', async () => {
    const state = setup();
    state.publicClient.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'User already registered' },
    });

    await expect(AuthService.register(params)).rejects.toMatchObject({ statusCode: 409 });
  });
});
