import { describe, expect, it } from 'vitest';
import { formatErrorResponse, AppError, ValidationError, UnauthorizedError } from '@/lib/errors';
import {
  getRegisterFieldErrors,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
} from '@/lib/validations/auth.schemas';

/** Mimics a route handler: parse, and on throw format the error. */
function handleParse<T>(schema: { parse: (v: unknown) => T }, body: unknown) {
  try {
    return { ok: true as const, data: schema.parse(body) };
  } catch (error: unknown) {
    return { ok: false as const, response: formatErrorResponse(error) };
  }
}

describe('Authentication request validation returns HTTP 400', () => {
  it('uses the same registration rules for browser validation as the API', () => {
    const errors = getRegisterFieldErrors({
      firstName: 'A',
      lastName: 'User',
      email: 'a@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      role: 'client',
      agreeToTerms: true,
    });

    expect(errors.firstName).toBe('Must be at least 2 characters');
    expect(errors.password).toBe('Password must contain at least one uppercase letter');
  });

  it('maps an invalid login body to 400 VALIDATION_ERROR', () => {
    const result = handleParse(loginSchema, { email: 'not-an-email', password: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.statusCode).toBe(400);
    expect(result.response.error.code).toBe('VALIDATION_ERROR');
    expect(result.response.success).toBe(false);
  });

  it('reports per-field details for each invalid login field', () => {
    const result = handleParse(loginSchema, { email: 'nope', password: '' });
    if (result.ok) throw new Error('expected validation failure');
    const fields = result.response.error.details.map((d) => d.field);
    expect(fields).toContain('email');
    expect(fields).toContain('password');
  });

  it('maps an invalid register body to 400, including cross-field refinements', () => {
    const result = handleParse(registerSchema, {
      firstName: 'A',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'StrongPass1',
      confirmPassword: 'Different1',
      role: 'consultant',
      agreeToTerms: true,
    });
    if (result.ok) throw new Error('expected validation failure');
    expect(result.response.statusCode).toBe(400);
    const mismatch = result.response.error.details.find(
      (d) => d.field === 'confirmPassword' && d.message === 'Passwords do not match'
    );
    expect(mismatch).toBeDefined();
  });

  it('maps an invalid reset-password send body to 400', () => {
    const result = handleParse(forgotPasswordSchema, { email: 'missing-at-sign' });
    if (result.ok) throw new Error('expected validation failure');
    expect(result.response.statusCode).toBe(400);
    expect(result.response.error.code).toBe('VALIDATION_ERROR');
  });

  it('never echoes submitted input values back in the error body', () => {
    const secret = 'hunter2-SUPERSECRET';
    const result = handleParse(loginSchema, { email: 'nope', password: secret });
    if (result.ok) throw new Error('expected validation failure');
    expect(JSON.stringify(result.response)).not.toContain(secret);
  });

  it('still accepts a valid login body unchanged', () => {
    const result = handleParse(loginSchema, { email: 'User@Example.com', password: 'anything' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.email).toBe('user@example.com');
  });

  it('preserves existing AppError status mapping', () => {
    expect(formatErrorResponse(new ValidationError('bad')).statusCode).toBe(400);
    expect(formatErrorResponse(new UnauthorizedError()).statusCode).toBe(401);
    expect(formatErrorResponse(new AppError('boom', 418, 'TEAPOT')).statusCode).toBe(418);
  });

  it('still maps genuinely unknown errors to 500', () => {
    const result = formatErrorResponse(new Error('unexpected'));
    expect(result.statusCode).toBe(500);
    expect(result.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
