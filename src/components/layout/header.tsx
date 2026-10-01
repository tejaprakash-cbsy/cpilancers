'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import {
  Menu,
  X,
  BriefcaseBusiness,
  UserRound,
  UsersRound,
} from 'lucide-react';

export const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const pathname = usePathname();

  const navLinks = [
    { name: 'Find Work', href: '/jobs', icon: BriefcaseBusiness },
    { name: 'Find Talent', href: '/consultants', icon: UsersRound },
    { name: 'Browse Jobs', href: '/jobs', icon: BriefcaseBusiness },
    { name: 'Browse Freelancers', href: '/consultants', icon: UserRound },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#dde1e7] bg-white">
      <div className="max-w-[1312px] mx-auto px-5 sm:px-8">
        <div className="flex h-[72px] items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-10">
            <Link href="/" className="group">
              <Logo size={34} />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-7">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`text-[12px] transition-colors flex items-center gap-1.5 ${
                    isActive(link.href)
                      ? 'font-semibold text-[#365cf5]'
                      : 'text-[#172033] hover:text-[#365cf5]'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>

          {/* Desktop Right Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-[12px] text-[#365cf5] hover:text-[#2445c7]">
              Log in
            </Link>
            <Link href="/register">
              <Button variant="primary" size="sm">Sign up</Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-[10px] text-[#667085] hover:text-[#172033] hover:bg-[#f5f6f8] focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-2 pb-6 space-y-3">
          <nav className="space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg text-base font-medium ${
                  isActive(link.href)
                    ? 'text-[#365cf5] font-semibold'
                    : 'text-[#172033] hover:bg-[#f5f6f8]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{link.name}</span>
                </div>
              </Link>
            ))}
          </nav>
          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="outline" className="w-full justify-center">
                Log in
              </Button>
            </Link>
            <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="primary" className="w-full justify-center">
                Join Platform
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
