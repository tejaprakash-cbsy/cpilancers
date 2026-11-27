import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDashboardNavItems } from '@/components/layout/dashboard-shell';

const consultantPage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/dashboard/consultant/page.tsx'),
  'utf8'
);
const clientPage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/dashboard/client/page.tsx'),
  'utf8'
);
const dashboardShell = fs.readFileSync(
  path.join(process.cwd(), 'src/components/layout/dashboard-shell.tsx'),
  'utf8'
);
const appChrome = fs.readFileSync(
  path.join(process.cwd(), 'src/components/layout/app-chrome.tsx'),
  'utf8'
);
const contractsPage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/contracts/page.tsx'),
  'utf8'
);
const contractDetailPage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/contracts/[id]/page.tsx'),
  'utf8'
);

const FORBIDDEN_JARGON = [
  'endpoint',
  'current services',
  'not exposed',
  'No proposals returned for this account',
  'September earnings',
  'September spend',
  'Freelancer account',
  'UnavailablePanel',
];

describe('Dashboard UI & Copy Polish Regression Guard', () => {
  it('removes all developer/API jargon and unavailable boxes from consultant and client dashboards', () => {
    for (const term of FORBIDDEN_JARGON) {
      expect(consultantPage).not.toContain(term);
      expect(clientPage).not.toContain(term);
    }
  });

  it('uses local-time greetings instead of a hardcoded Good morning heading', () => {
    expect(consultantPage).toContain('getLocalGreeting');
    expect(clientPage).toContain('getLocalGreeting');
    expect(consultantPage).toContain('Good afternoon');
    expect(consultantPage).toContain('Good evening');
  });

  it('aligns sidebar navigation with community-first launch scope and updates role labels', () => {
    expect(dashboardShell).toContain("{ label: 'Forum', href: '/forum'");
    expect(dashboardShell).toContain('Search SAP discussions, jobs, consultants...');
    expect(consultantPage).toContain('roleLabel="SAP Consultant"');
    expect(clientPage).toContain('roleLabel="Enterprise Client"');
    expect(consultantPage).toContain('role="consultant"');
    expect(clientPage).toContain('role="client"');
  });

  it('includes cohesive onboarding checklist and Community Forum card on both dashboards', () => {
    expect(consultantPage).toContain('bg-[#365cf5]/[0.04]');
    expect(consultantPage).toContain('Complete SAP profile');
    expect(consultantPage).toContain('Browse open discussions');
    expect(consultantPage).toContain('Community Forum');

    expect(clientPage).toContain('bg-[#365cf5]/[0.04]');
    expect(clientPage).toContain('Complete company profile');
    expect(clientPage).toContain('Browse open discussions');
    expect(clientPage).toContain('Community Forum');
  });

  it('uses the Cool Blue-Slate Light sidebar theme in DashboardShell', () => {
    expect(dashboardShell).toContain('bg-[#f4f6fb]');
    expect(dashboardShell).toContain('border-slate-200/80');
    expect(dashboardShell).toContain('variant="light"');
    expect(dashboardShell).toContain('bg-[#365cf5]/10');
    expect(dashboardShell).toContain('focus-visible:ring-[#365cf5]/40');
    expect(dashboardShell).not.toContain('bg-[#111827]');
  });

  it('provides non-empty role-based default navigation items when navItems is omitted', () => {
    const consultantNav = getDashboardNavItems('consultant');
    expect(consultantNav.length).toBeGreaterThanOrEqual(5);
    expect(consultantNav[0]).toMatchObject({ label: 'Overview', href: '/dashboard/consultant' });
    expect(consultantNav.some((item) => item.href === '/forum' && item.label === 'Forum')).toBe(true);

    const clientNav = getDashboardNavItems('client');
    expect(clientNav.length).toBeGreaterThanOrEqual(5);
    expect(clientNav[0]).toMatchObject({ label: 'Overview', href: '/dashboard/client' });
    expect(clientNav.some((item) => item.href === '/forum' && item.label === 'Forum')).toBe(true);

    const adminNav = getDashboardNavItems('admin');
    expect(adminNav[0]).toMatchObject({ label: 'Overview', href: '/admin' });
    expect(adminNav.some((item) => item.href === '/forum')).toBe(true);

    const fallbackNav = getDashboardNavItems(null);
    expect(fallbackNav.length).toBeGreaterThanOrEqual(5);
    expect(fallbackNav[0]).toMatchObject({ label: 'Overview', href: '/dashboard' });

    expect(dashboardShell).toContain(
      'navItems && navItems.length > 0 ? navItems : getDashboardNavItems(role)'
    );
    expect(dashboardShell).toContain('action="/api/auth/logout"');
  });

  it('suppresses public header on /contracts and removes empty navItems overrides', () => {
    expect(appChrome).toContain("'/contracts'");
    expect(contractsPage).not.toContain('navItems={[]}');
    expect(contractDetailPage).not.toContain('navItems={[]}');
  });
});
