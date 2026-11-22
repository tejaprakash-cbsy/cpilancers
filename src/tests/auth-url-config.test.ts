import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('getAppUrl production/development behavior', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns configured NEXT_PUBLIC_APP_URL when set', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(getAppUrl()).toBe('https://custom.example.com');
  });

  it('strips trailing slashes from NEXT_PUBLIC_APP_URL', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com///';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(getAppUrl()).toBe('https://custom.example.com');
  });

  it('falls back to VERCEL_PROJECT_PRODUCTION_URL in non-production when NEXT_PUBLIC_APP_URL is not set', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'my-app.vercel.app';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(getAppUrl()).toBe('https://my-app.vercel.app');
  });

  it('falls back to VERCEL_URL in non-production when neither NEXT_PUBLIC_APP_URL nor VERCEL_PROJECT_PRODUCTION_URL is set', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VERCEL_URL = 'my-app-git-branch-user.vercel.app';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(getAppUrl()).toBe('https://my-app-git-branch-user.vercel.app');
  });

  it('falls back to localhost:3000 in non-production when no env vars are set', async () => {
    process.env.NODE_ENV = 'development';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(getAppUrl()).toBe('http://localhost:3000');
  });

  it('throws APP_URL_NOT_CONFIGURED in production when NEXT_PUBLIC_APP_URL is not set', async () => {
    process.env.NODE_ENV = 'production';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(() => getAppUrl()).toThrow('NEXT_PUBLIC_APP_URL must be configured in production environment');
  });

  it('throws APP_URL_NOT_CONFIGURED in production even when VERCEL_URL is set but NEXT_PUBLIC_APP_URL is not', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_URL = 'my-app.vercel.app';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(() => getAppUrl()).toThrow('NEXT_PUBLIC_APP_URL must be configured in production environment');
  });

  it('falls back to VERCEL_URL in Vercel preview (VERCEL_ENV=preview) even when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'preview-app.vercel.app';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(getAppUrl()).toBe('https://preview-app.vercel.app');
  });

  it('returns NEXT_PUBLIC_APP_URL in production when explicitly set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_URL = 'https://cpilancers.com';
    const { getAppUrl } = await import('@/services/auth.service');
    expect(getAppUrl()).toBe('https://cpilancers.com');
  });
});

describe('env.ts server-side NEXT_PUBLIC_APP_URL with Vercel fallback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    delete process.env.NODE_ENV;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses NEXT_PUBLIC_APP_URL when explicitly set on server', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    process.env.NEXT_PUBLIC_APP_URL = 'https://explicit.example.com';
    const { env } = await import('@/config/env');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://explicit.example.com');
  });

  it('falls back to VERCEL_PROJECT_PRODUCTION_URL on server when NEXT_PUBLIC_APP_URL not set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'vercel-prod.example.com';
    const { env } = await import('@/config/env');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://vercel-prod.example.com');
  });

  it('falls back to VERCEL_URL on server when neither NEXT_PUBLIC_APP_URL nor VERCEL_PROJECT_PRODUCTION_URL set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    process.env.VERCEL_URL = 'vercel-preview.example.com';
    const { env } = await import('@/config/env');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://vercel-preview.example.com');
  });

  it('falls back to localhost:3000 on server when no Vercel vars set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    const { env } = await import('@/config/env');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });
});

describe('getTrustedOrigins ALLOWED_ORIGINS parsing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.NEXT_PUBLIC_VERCEL_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses comma-separated ALLOWED_ORIGINS', async () => {
    process.env.ALLOWED_ORIGINS = 'https://cpilancers.com,https://www.cpilancers.com';
    const { getTrustedOrigins } = await import('@/lib/security/origin');
    const origins = getTrustedOrigins();
    expect(origins.has('https://cpilancers.com')).toBe(true);
    expect(origins.has('https://www.cpilancers.com')).toBe(true);
  });

  it('handles spaces around comma-separated ALLOWED_ORIGINS', async () => {
    process.env.ALLOWED_ORIGINS = 'https://cpilancers.com, https://www.cpilancers.com';
    const { getTrustedOrigins } = await import('@/lib/security/origin');
    const origins = getTrustedOrigins();
    expect(origins.has('https://cpilancers.com')).toBe(true);
    expect(origins.has('https://www.cpilancers.com')).toBe(true);
  });

  it('ignores malformed entries in ALLOWED_ORIGINS', async () => {
    process.env.ALLOWED_ORIGINS = 'https://valid.com,not-a-url,https://also-valid.com';
    const { getTrustedOrigins } = await import('@/lib/security/origin');
    const origins = getTrustedOrigins();
    expect(origins.has('https://valid.com')).toBe(true);
    expect(origins.has('https://also-valid.com')).toBe(true);
    expect(origins.size).toBe(2);
  });

  it('combines NEXT_PUBLIC_APP_URL and ALLOWED_ORIGINS', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ALLOWED_ORIGINS = 'https://www.example.com';
    const { getTrustedOrigins } = await import('@/lib/security/origin');
    const origins = getTrustedOrigins();
    expect(origins.has('https://app.example.com')).toBe(true);
    expect(origins.has('https://www.example.com')).toBe(true);
  });

  it('does not accept wildcard patterns like *.vercel.app', async () => {
    process.env.ALLOWED_ORIGINS = 'https://*.vercel.app';
    const { getTrustedOrigins } = await import('@/lib/security/origin');
    const origins = getTrustedOrigins();
    expect(origins.size).toBe(0);
  });
});