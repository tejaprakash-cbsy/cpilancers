import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consultantProfileSchema,
  profileSchema,
} from '@/lib/validations/profile.schemas';

const mockGetCurrentUser = vi.fn();
const mockUpdatePassword = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
  },
}));

describe('Profile INR localization & settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults profileSchema countryCode to IN and timezone to Asia/Kolkata', () => {
    const parsed = profileSchema.parse({
      firstName: 'Arjun',
      lastName: 'Mehta',
      displayName: 'Arjun Mehta',
    });

    expect(parsed.countryCode).toBe('IN');
    expect(parsed.timezone).toBe('Asia/Kolkata');
  });

  it('enforces INR paise bounds (₹500 to ₹50,000/hr) on consultantProfileSchema', () => {
    const base = {
      professionalHeadline: 'Senior SAP CPI & Integration Suite Architect',
      yearsSapExperience: 6,
      yearsCpiExperience: 4,
      minProjectSizeCents: 0,
      availabilityStatus: 'available' as const,
      availableHoursPerWeek: 40,
      overviewMarkdown: 'Experienced SAP CPI consultant delivering S/4HANA integrations.',
    };

    expect(
      consultantProfileSchema.safeParse({ ...base, hourlyRateCents: 49999 }).success
    ).toBe(false);
    expect(
      consultantProfileSchema.safeParse({ ...base, hourlyRateCents: 50000 }).success
    ).toBe(true);
    expect(
      consultantProfileSchema.safeParse({ ...base, hourlyRateCents: 5000000 }).success
    ).toBe(true);
    expect(
      consultantProfileSchema.safeParse({ ...base, hourlyRateCents: 5000001 }).success
    ).toBe(false);
  });

  it('wires Settings link, account menu, and AppChrome suppression', () => {
    const shellSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/layout/dashboard-shell.tsx'),
      'utf8'
    );
    const chromeSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/layout/app-chrome.tsx'),
      'utf8'
    );

    expect(shellSource).toContain("href: '/settings'");
    expect(shellSource).toContain('href="/settings#notifications"');
    expect(shellSource).toContain('href="/profile/edit"');
    expect(shellSource).toContain('role="menu"');
    expect(chromeSource).toContain("'/settings'");
    expect(chromeSource).toContain("'/profile/edit'");
  });

  it('requires auth, validates strength, and updates password on POST /api/auth/change-password', async () => {
    const { POST } = await import('@/app/api/auth/change-password/route');

    mockGetCurrentUser.mockResolvedValueOnce(null);
    const unauthRes = await POST(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password: 'Password123',
          confirmPassword: 'Password123',
        }),
      })
    );
    expect(unauthRes.status).toBe(401);

    mockGetCurrentUser.mockResolvedValueOnce({
      id: 'user-1',
      email: 'arjun@example.com',
      role: 'consultant',
    });
    const weakRes = await POST(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password: 'weak',
          confirmPassword: 'weak',
        }),
      })
    );
    expect(weakRes.status).toBe(400);

    mockGetCurrentUser.mockResolvedValueOnce({
      id: 'user-1',
      email: 'arjun@example.com',
      role: 'consultant',
    });
    mockUpdatePassword.mockResolvedValueOnce({ success: true });
    const okRes = await POST(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password: 'Password123',
          confirmPassword: 'Password123',
        }),
      })
    );
    expect(okRes.status).toBe(200);
    expect(mockUpdatePassword).toHaveBeenCalledWith('Password123');
  });
});
