import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_PATH,
  ROLE_HOME_PATH,
  isSafeNextPath,
  resolvePostLoginPath,
  roleHomePath,
} from '@/lib/auth/role-redirects';
import type { UserRole } from '@/types/database';

/**
 * Regression coverage for role-based post-login routing.
 *
 * The sign-in form used to hardcode `/dashboard/client`, so every consultant
 * landed on the client dashboard after a successful login. These tests pin the
 * role -> destination map, the `?next=` precedence, and the same-origin
 * protection that already existed.
 */

describe('role -> home path mapping', () => {
  it('sends a client to the client dashboard', () => {
    expect(roleHomePath('client')).toBe('/dashboard/client');
  });

  it('sends a consultant to the consultant dashboard', () => {
    // The exact regression: a consultant must never be pushed to
    // /dashboard/client.
    expect(roleHomePath('consultant')).toBe('/dashboard/consultant');
    expect(roleHomePath('consultant')).not.toBe('/dashboard/client');
  });

  it('routes an admin to the dedicated /admin dashboard', () => {
    const path = roleHomePath('admin');
    expect(path).toBe(ROLE_HOME_PATH.admin);
    expect(path).toBe('/admin');
    expect(path.startsWith('/')).toBe(true);
  });

  it('every mapped role resolves to a path inside this app', () => {
    const roles: UserRole[] = ['client', 'consultant', 'admin'];
    for (const role of roles) {
      const path = roleHomePath(role);
      expect(path.startsWith('/')).toBe(true);
      expect(path.startsWith('//')).toBe(false);
    }
  });

  it('falls back to the default home when the role is missing', () => {
    expect(roleHomePath(null)).toBe(DEFAULT_HOME_PATH);
    expect(roleHomePath(undefined)).toBe(DEFAULT_HOME_PATH);
  });

  it('falls back rather than throwing on an unrecognised role', () => {
    // Guards against a role being added to the database enum before this map
    // is updated: sign-in must still complete.
    const unknown = 'superuser' as UserRole;
    expect(roleHomePath(unknown)).toBe(DEFAULT_HOME_PATH);
  });
});

describe('resolvePostLoginPath honours the caller role', () => {
  it('routes a consultant with no ?next= to the consultant dashboard', () => {
    expect(resolvePostLoginPath('consultant')).toBe('/dashboard/consultant');
  });

  it('routes a client with no ?next= to the client dashboard', () => {
    expect(resolvePostLoginPath('client')).toBe('/dashboard/client');
  });

  it('routes an admin with no ?next= to the admin dashboard', () => {
    expect(resolvePostLoginPath('admin')).toBe('/admin');
  });

  it('routes a consultant who logged in with a null role to the default home', () => {
    // The server can return role: null if the profile lookup failed; the client
    // must still land somewhere real instead of throwing.
    expect(resolvePostLoginPath(null)).toBe(DEFAULT_HOME_PATH);
  });
});

describe('resolvePostLoginPath prefers a safe ?next= value', () => {
  it('keeps a deep link the user was originally bounced from', () => {
    expect(resolvePostLoginPath('consultant', '/messages')).toBe('/messages');
    expect(resolvePostLoginPath('client', '/jobs/123/edit')).toBe('/jobs/123/edit');
  });

  it('ignores ?next= for a client and uses the client dashboard', () => {
    // The role wins only when ?next= is unusable -- never the other way round.
    expect(resolvePostLoginPath('client', 'not-a-path')).toBe('/dashboard/client');
  });

  it('ignores a ?next= that is an absolute URL to another host', () => {
    expect(resolvePostLoginPath('consultant', 'https://evil.example/steal')).toBe(
      '/dashboard/consultant'
    );
  });

  it('ignores a protocol-relative ?next= that would leak to another host', () => {
    expect(resolvePostLoginPath('consultant', '//evil.example')).toBe(
      '/dashboard/consultant'
    );
  });
});

describe('same-origin protection for ?next= is preserved', () => {
  it('accepts a plain relative path', () => {
    expect(isSafeNextPath('/profile')).toBe(true);
    expect(isSafeNextPath('/jobs?page=2')).toBe(true);
  });

  it('rejects a protocol-relative path', () => {
    expect(isSafeNextPath('//evil.example')).toBe(false);
    expect(isSafeNextPath('//evil.example/path')).toBe(false);
  });

  it('rejects an absolute URL', () => {
    expect(isSafeNextPath('https://evil.example')).toBe(false);
    expect(isSafeNextPath('http://evil.example')).toBe(false);
  });

  it('rejects a path that does not start with a slash', () => {
    expect(isSafeNextPath('evil.example')).toBe(false);
    expect(isSafeNextPath('javascript:alert(1)')).toBe(false);
  });

  it('rejects an empty or absent value', () => {
    expect(isSafeNextPath('')).toBe(false);
    expect(isSafeNextPath(null)).toBe(false);
    expect(isSafeNextPath(undefined)).toBe(false);
  });

  it('rejects control characters that could smuggle a second header', () => {
    expect(isSafeNextPath('/profile\r\nSet-Cookie: a=b')).toBe(false);
    expect(isSafeNextPath('/profile\n//evil.example')).toBe(false);
  });

  it('rejects backslash variants that could bypass prefix checks in WHATWG parsers', () => {
    expect(isSafeNextPath('/\\evil.example')).toBe(false);
    expect(isSafeNextPath('/\\/evil.example')).toBe(false);
    expect(isSafeNextPath('/path\\something')).toBe(false);
  });

  it('never resolves to an off-origin path for any role and next combination', () => {
    const roles: (UserRole | null)[] = ['client', 'consultant', 'admin', null];
    const candidates = [
      '/profile',
      '//evil.example',
      'https://evil.example',
      'evil.example',
      '',
      null,
    ];
    for (const role of roles) {
      for (const next of candidates) {
        const resolved = resolvePostLoginPath(role, next);
        expect(resolved.startsWith('/')).toBe(true);
        expect(resolved.startsWith('//')).toBe(false);
        expect(resolved).not.toMatch(/^[a-z]+:/i);
      }
    }
  });
});