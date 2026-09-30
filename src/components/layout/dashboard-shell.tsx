'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  ChevronsUpDown,
  CircleHelp,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  navItems?: DashboardNavItem[];
  footerItems?: DashboardNavItem[];
  searchPlaceholder?: string;
  className?: string;
}

const defaultNavItems: DashboardNavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
];

const defaultFooterItems: DashboardNavItem[] = [
  { label: 'Help center', href: '/help', icon: CircleHelp },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function DashboardShell({
  children,
  accountName,
  roleLabel,
  initials,
  navItems = defaultNavItems,
  footerItems = defaultFooterItems,
  searchPlaceholder = 'Search jobs, talent, messages',
  className,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));

  const renderNavItem = (item: DashboardNavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          'flex h-[42px] w-full items-center gap-[11px] rounded-[6px] px-3 text-sm transition-colors',
          active
            ? 'bg-[#365cf5] text-white'
            : 'text-white/80 hover:bg-white/[0.07] hover:text-white'
        )}
      >
        <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className={cn('flex min-h-screen bg-[#f5f6f8] text-[#172033]', className)}>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col gap-[26px] bg-[#111827] px-[18px] py-[26px] transition-transform lg:static lg:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Link href="/" className="flex items-center gap-[10px]">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-white text-lg font-extrabold text-[#365cf5]">
            L
          </span>
          <span className="text-[22px] font-normal leading-none text-white">Lancers</span>
        </Link>

        <button
          type="button"
          className="flex w-full items-center gap-[10px] rounded-[10px] bg-white/[0.07] p-3 text-left hover:bg-white/[0.11]"
          aria-label="Switch account"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#eef1ff] text-[11px] font-bold text-[#365cf5]">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-white">{accountName}</span>
            <span className="block truncate text-[11px] text-white/60">{roleLabel}</span>
          </span>
          <ChevronsUpDown className="h-[15px] w-[15px] shrink-0 text-white/70" />
        </button>

        <nav className="flex w-full flex-col gap-[6px]">{navItems.map(renderNavItem)}</nav>

        <nav className="mt-auto flex w-full flex-col gap-2">
          {footerItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-[41px] items-center gap-[10px] rounded-[6px] px-3 text-sm text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white"
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[#111827]/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <section className="flex min-w-0 flex-1 flex-col lg:ml-0">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#dde1e7] bg-white px-5 sm:px-8">
          <button
            type="button"
            className="rounded-[10px] p-2 text-[#667085] hover:bg-[#f5f6f8] lg:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <label className="flex h-10 w-full max-w-[360px] items-center gap-[9px] rounded-[10px] bg-[#f5f6f8] px-3 text-sm text-[#667085]">
            <span className="sr-only">Search</span>
            <Search className="h-[17px] w-[17px] shrink-0" strokeWidth={1.7} />
            <input
              type="search"
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#172033] outline-none placeholder:text-[#667085]"
            />
          </label>
          <div className="flex items-center gap-[18px]">
            <button
              type="button"
              aria-label="Notifications"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#f5f6f8] text-[#667085] hover:text-[#172033]"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              type="button"
              aria-label="Account menu"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#eef1ff] text-xs font-bold text-[#365cf5]"
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
