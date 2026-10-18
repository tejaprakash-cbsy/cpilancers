import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockRegister = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    register: (...args: unknown[]) => mockRegister(...args),
  },
}));

import { POST } from '@/app/api/auth/register/route';

const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function registerRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_CLIENT_PAYLOAD = {
  firstName: 'Jane',
  lastName: 'Client',
  email: 'jane.client@example.com',
  password: 'Password123!',
  confirmPassword: 'Password123!',
  role: 'client',
  agreeToTerms: true,
};

const VALID_CONSULTANT_PAYLOAD = {
  firstName: 'John',
  lastName: 'Consultant',
  email: 'john.consultant@example.com',
  password: 'Password123!',
  confirmPassword: 'Password123!',
  role: 'consultant',
  agreeToTerms: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/register route tests', () => {
  it('successfully registers a client and returns 201 with public user data', async () => {
    mockRegister.mockResolvedValue({
      user: { id: USER_ID, email: 'jane.client@example.com' },
      emailSent: true,
    });

    const res = await POST(registerRequest(VALID_CLIENT_PAYLOAD));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toEqual({
      id: USER_ID,
      email: 'jane.client@example.com',
    });
    expect(body.data.emailSent).toBe(true);
    expect(body.data.message).toContain('Registration successful');
    expect(mockRegister).toHaveBeenCalledWith({
      email: 'jane.client@example.com',
      password: 'Password123!',
      role: 'client',
      firstName: 'Jane',
      lastName: 'Client',
    });
  });

  it('successfully registers a consultant and returns 201', async () => {
    mockRegister.mockResolvedValue({
      user: { id: USER_ID, email: 'john.consultant@example.com' },
      emailSent: true,
    });

    const res = await POST(registerRequest(VALID_CONSULTANT_PAYLOAD));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('john.consultant@example.com');
    expect(mockRegister).toHaveBeenCalledWith({
      email: 'john.consultant@example.com',
      password: 'Password123!',
      role: 'consultant',
      firstName: 'John',
      lastName: 'Consultant',
    });
  });

  it('strictly rejects role "admin" with 400 VALIDATION_ERROR and prevents registration', async () => {
    const adminPayload = {
      ...VALID_CLIENT_PAYLOAD,
      role: 'admin',
    };

    const res = await POST(registerRequest(adminPayload));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects registration when password and confirmPassword do not match', async () => {
    const mismatchPayload = {
      ...VALID_CLIENT_PAYLOAD,
      confirmPassword: 'MismatchPassword999!',
    };

    const res = await POST(registerRequest(mismatchPayload));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'confirmPassword',
          message: 'Passwords do not match',
        }),
      ])
    );
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects registration when agreeToTerms is false', async () => {
    const noTermsPayload = {
      ...VALID_CLIENT_PAYLOAD,
      agreeToTerms: false,
    };

    const res = await POST(registerRequest(noTermsPayload));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects registration when password is weak (< 8 characters)', async () => {
    const weakPassPayload = {
      ...VALID_CLIENT_PAYLOAD,
      password: 'short',
      confirmPassword: 'short',
    };

    const res = await POST(registerRequest(weakPassPayload));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('handles duplicate user conflict from AuthService gracefully', async () => {
    const { ConflictError } = await import('@/lib/errors');
    mockRegister.mockRejectedValue(new ConflictError('User with this email already exists.'));

    const res = await POST(registerRequest(VALID_CLIENT_PAYLOAD));
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('User with this email already exists.');
  });

  it('never leaks password or sensitive fields in error or success responses', async () => {
    const secretPass = 'SuperSecret123!';
    mockRegister.mockResolvedValue({
      user: { id: USER_ID, email: 'jane.client@example.com' },
      emailSent: true,
    });

    const res = await POST(
      registerRequest({
        ...VALID_CLIENT_PAYLOAD,
        password: secretPass,
        confirmPassword: secretPass,
      })
    );

    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain(secretPass);
  });
});
