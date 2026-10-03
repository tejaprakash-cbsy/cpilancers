import { describe, it, expect } from 'vitest';
import { hardenSessionCookieOptions } from '@/lib/supabase/cookie-options';

/**
 * F-01 regression guard.
 *
 * The session cookie hardening lives in one helper so the two cookie writers
 * (`server.ts` and `middleware.ts`) cannot drift. These assertions pin the
 * attributes that make up the finding, and pin the ones that must NOT move.
 */
describe('F-01 session cookie attributes', () => {
  it('forces HttpOnly so the session is unreadable from JavaScript', () => {
    expect(hardenSessionCookieOptions({ httpOnly: false }).httpOnly).toBe(true);
  });

  it('forces Secure so the session is never sent over plain HTTP', () => {
    expect(hardenSessionCookieOptions({ secure: false }).secure).toBe(true);
    expect(hardenSessionCookieOptions(undefined).secure).toBe(true);
  });

  it('keeps SameSite=Lax and never downgrades to SameSite=None', () => {
    expect(hardenSessionCookieOptions({ sameSite: 'none' }).sameSite).toBe('lax');
    expect(hardenSessionCookieOptions({ sameSite: 'strict' }).sameSite).toBe('lax');
    expect(hardenSessionCookieOptions(undefined).sameSite).toBe('lax');
  });

  it('preserves path, maxAge and expires so session lifetime is unchanged', () => {
    const maxAge = 34560000;
    const expires = new Date('2027-11-07T06:30:13.000Z');
    const result = hardenSessionCookieOptions({ path: '/', maxAge, expires });

    expect(result.path).toBe('/');
    expect(result.maxAge).toBe(maxAge);
    expect(result.expires).toBe(expires);
  });

  it('defaults path to / when Supabase omits it', () => {
    expect(hardenSessionCookieOptions(undefined).path).toBe('/');
  });

  it('tolerates an absent options object', () => {
    const result = hardenSessionCookieOptions(undefined);
    expect(result.httpOnly).toBe(true);
    expect(result.secure).toBe(true);
    expect(result.sameSite).toBe('lax');
  });
});