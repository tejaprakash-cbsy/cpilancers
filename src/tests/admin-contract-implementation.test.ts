import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AppError, formatErrorResponse, ValidationError } from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/security/correlation';
import { adminResourceIdSchema } from '@/lib/validations/admin.schemas';

const repo = resolve(process.cwd());

describe('approved admin contract', () => {
  it('accepts the installed Zod UUID representations and rejects malformed/noncanonical forms', () => {
    const canonical = '550e8400-e29b-41d4-a716-446655440000';
    expect(adminResourceIdSchema.safeParse(canonical).success).toBe(true);
    expect(adminResourceIdSchema.safeParse(canonical.toUpperCase()).success).toBe(true);
    expect(adminResourceIdSchema.safeParse(`{${canonical}}`).success).toBe(false);
    expect(adminResourceIdSchema.safeParse(canonical.replaceAll('-', '')).success).toBe(false);
    expect(adminResourceIdSchema.safeParse(`urn:uuid:${canonical}`).success).toBe(false);
    expect(adminResourceIdSchema.safeParse('not-an-id').success).toBe(false);
  });

  it('uses a trusted UUID correlation ID and replaces arbitrary incoming values', () => {
    const incoming = '550e8400-e29b-41d4-a716-446655440000';
    expect(resolveCorrelationId(new Request('http://localhost', { headers: { 'x-request-id': incoming } }))).toBe(incoming);
    const generated = resolveCorrelationId(new Request('http://localhost', { headers: { 'x-request-id': 'attacker-controlled' } }));
    expect(z.uuid().safeParse(generated).success).toBe(true);
    expect(generated).not.toBe('attacker-controlled');
  });

  it('does not expose raw provider/database details or environment-dependent messages', () => {
    const raw = { message: 'password=secret SQL SELECT * FROM users', details: 'stack /internal/path' };
    const response = formatErrorResponse(new AppError('provider failed', 500, 'PAYMENT_LIST_FAILED', raw), '550e8400-e29b-41d4-a716-446655440000');
    expect(response.error.message).toBe('Request could not be completed.');
    expect(JSON.stringify(response)).not.toContain('password=secret');
    expect(JSON.stringify(response)).not.toContain('SELECT *');
    expect(JSON.stringify(response)).not.toContain('/internal/path');
    expect(response.error.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('preserves sanitized validation details without submitted values', () => {
    const response = formatErrorResponse(new ValidationError('Invalid input', [{ path: ['email'], code: 'invalid_format', message: 'Invalid email' }]));
    expect(response.error.details).toEqual([{ field: 'email', code: 'invalid_format', message: 'Invalid email' }]);
    expect(JSON.stringify(response)).not.toContain('password');
  });

  it('keeps dispute mutation on the dynamic route and the failed response separate', () => {
    const disputeRoute = readFileSync(resolve(repo, 'src/app/api/admin/disputes/[id]/route.ts'), 'utf8');
    const collectionRoute = readFileSync(resolve(repo, 'src/app/api/admin/disputes/route.ts'), 'utf8');
    const service = readFileSync(resolve(repo, 'src/services/admin.service.ts'), 'utf8');
    expect(disputeRoute).toContain('export async function PATCH');
    expect(disputeRoute).toContain('parseAdminResourceId');
    expect(collectionRoute).not.toContain('export async function PATCH');
    expect(service).toContain('payments: { rows: payments ?? []');
    expect(service).toContain('payouts: { rows: payouts ?? []');
    expect(service).toContain("eq('status', 'failed')");
    expect(service).toContain("eq('contract_id', filters.contractId)");
    expect(service).toContain("in('payment_id', paymentIds)");
  });
});
