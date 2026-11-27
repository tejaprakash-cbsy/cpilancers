'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ChevronsUpDown,
  CircleHelp,
  FileText,
  FileWarning,
  LogOut,
  Menu,
  MessagesSquare,
  MessageSquareText,
  Search,
  Settings,
  User,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/logo';
import { roleHomePath } from '@/lib/auth/role-redirects';
import type { UserRole } from '@/types/database';

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface DashboardShellProps {
  children: React.ReactNode;
  accountName: string;
  roleLabel: string;
  initials: string;
  role?: UserRole | null;
  navItems?: DashboardNavItem[];
  footerItems?: DashboardNavItem[];
  searchPlaceholder?: string;
  className?: string;
}

export function getDashboardNavItems(role?: UserRole | null): DashboardNavItem[] {
  if (role === 'client') {
    return [
      { label: 'Overview', href: '/dashboard/client', icon: BarChart3 },
      { label: 'Forum', href: '/forum', icon: MessageSquareText },
      { label: 'My jobs', href: '/jobs', icon: BriefcaseBusiness },
      { label: 'Consultants', href: '/consultants', icon: UsersRound },
      { label: 'Messages', href: '/messages', icon: MessagesSquare },
      { label: 'Profile', href: '/profile', icon: User },
    ];
  }

  if (role === 'admin') {
    return [
      { label: 'Overview', href: '/admin', icon: BarChart3 },
      { label: 'Forum', href: '/forum', icon: MessageSquareText },
      { label: 'Failed transactions', href: '/admin#transactions', icon: WalletCards },
      { label: 'Disputes', href: '/admin#disputes', icon: AlertTriangle },
      { label: 'Reports', href: '/admin#reports', icon: FileWarning },
    ];
  }

  const overviewHref = role ? roleHomePath(role) : '/dashboard';
  return [
    { label: 'Overview', href: overviewHref, icon: BarChart3 },
    { label: 'Forum', href: '/forum', icon: MessageSquareText },
    { label: 'Proposals', href: '/proposals', icon: FileText },
    { label: 'Jobs', href: '/jobs', icon: BriefcaseBusiness },
    { label: 'Messages', href: '/messages', icon: MessagesSquare },
    { label: 'Profile', href: '/profile', icon: User },
  ];
}

const defaultFooterItems: DashboardNavItem[] = [
  { label: 'Help center', href: '/contact', icon: CircleHelp },
  { label: 'Settings', href: '/profile', icon: Settings },
];

export function DashboardShell({
  children,
  accountName,
  roleLabel,
  initials,
  role,
  navItems,
  footerItems = defaultFooterItems,
  searchPlaceholder = 'Search SAP discussions, jobs, consultants...',
  className,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const resolvedNavItems =
    navItems && navItems.length > 0 ? navItems : getDashboardNavItems(role);

  const isActive = (href: string) => {
    const cleanHref = href.split('#')[0];
    if (
      cleanHref === '/dashboard' ||
      cleanHref === '/dashboard/consultant' ||
      cleanHref === '/dashboard/client' ||
      cleanHref === '/admin'
    ) {
      return pathname === cleanHref;
    }
    return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
  };

  const renderNavItem = (item: DashboardNavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          'group flex h-[40px] w-full items-center gap-[11px] rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40',
          active
            ? 'border border-slate-200/80 bg-white text-[#365cf5] shadow-[0_1px_2px_rgba(15,23,42,0.05)]'
            : 'border border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900'
        )}
      >
        <Icon
          className={cn(
            'h-[17px] w-[17px] shrink-0 transition-colors',
            active ? 'text-[#365cf5]' : 'text-slate-400 group-hover:text-slate-600'
          )}
          strokeWidth={1.7}
        />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className={cn('flex min-h-screen bg-[#f8fafc] text-slate-900', className)}>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col gap-[24px] border-r border-slate-200/80 bg-[#f4f6fb] px-[18px] py-[26px] transition-transform lg:static lg:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Link
          href="/"
          className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40"
        >
          <Logo size={34} variant="light" />
        </Link>

        <button
          type="button"
          className="flex w-full items-center gap-[10px] rounded-xl border border-slate-200/80 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40"
          aria-label="Switch account"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#365cf5]/10 text-[11px] font-semibold text-[#365cf5]">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">{accountName}</span>
            <span className="block truncate text-[11px] text-slate-500">{roleLabel}</span>
          </span>
          <ChevronsUpDown className="h-[15px] w-[15px] shrink-0 text-slate-400" />
        </button>

        <nav className="flex w-full flex-col gap-1.5">{resolvedNavItems.map(renderNavItem)}</nav>

        <nav className="mt-auto flex w-full flex-col gap-1.5 border-t border-slate-200/80 pt-4">
          {footerItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="group flex h-[40px] items-center gap-[10px] rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-white/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40"
              >
                <Icon
                  className="h-[17px] w-[17px] shrink-0 text-slate-400 transition-colors group-hover:text-slate-600"
                  strokeWidth={1.7}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="group flex h-[40px] w-full items-center gap-[10px] rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-white/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40"
            >
              <LogOut
                className="h-[17px] w-[17px] shrink-0 text-slate-400 transition-colors group-hover:text-slate-600"
                strokeWidth={1.7}
              />
              <span>Log out</span>
            </button>
          </form>
        </nav>
      </aside>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <section className="flex min-w-0 flex-1 flex-col lg:ml-0">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-8">
          <button
            type="button"
            className="rounded-[10px] p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40 lg:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <label className="flex h-10 w-full max-w-[360px] items-center gap-[9px] rounded-[10px] bg-slate-100/80 px-3 text-sm text-slate-500 focus-within:ring-2 focus-within:ring-[#365cf5]/30">
            <span className="sr-only">Search</span>
            <Search className="h-[17px] w-[17px] shrink-0" strokeWidth={1.7} />
            <input
              type="search"
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
            />
          </label>
          <div className="flex items-center gap-[18px]">
            <button
              type="button"
              aria-label="Notifications"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              type="button"
              aria-label="Account menu"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#365cf5]/10 text-xs font-semibold text-[#365cf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40"
            >
              {initials}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </section>
    </div>
  );
}
