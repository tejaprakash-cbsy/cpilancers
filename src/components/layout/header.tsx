'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Menu,
  X,
  Layers,
  Briefcase,
  Users,
  HelpCircle,
  LogIn,
  UserPlus,
} from 'lucide-react';

export const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const pathname = usePathname();

  const navLinks = [
    { name: 'Find Work', href: '/jobs', icon: Briefcase },
    { name: 'Find Consultants', href: '/consultants', icon: Users },
    { name: 'SAP Integration Suite', href: '/sap-integration-suite', icon: Layers, isSapBadge: true },
    { name: 'How It Works', href: '/how-it-works', icon: HelpCircle },
    { name: 'Pricing', href: '/pricing' },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-[#0a4d8c] flex items-center justify-center text-white font-bold text-lg shadow-sm group-hover:bg-[#083c6d] transition-colors">
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-slate-900 leading-tight">
                  CPI <span className="text-[#0284c7]">Lancers</span>
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  INTEGRATION MARKETPLACE
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    isActive(link.href)
                      ? 'bg-slate-100 text-[#0a4d8c]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {link.name}
                  {link.isSapBadge && (
                    <Badge variant="cpi" size="sm" className="ml-1">
                      CPI
                    </Badge>
                  )}
                </Link>
              ))}
            </nav>
          </div>

          {/* Desktop Right Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" leftIcon={<LogIn className="w-4 h-4" />}>
                Log in
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="primary" size="sm" leftIcon={<UserPlus className="w-4 h-4" />}>
                Join Platform
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
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
                    ? 'bg-blue-50 text-[#0a4d8c]'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{link.name}</span>
                  {link.isSapBadge && <Badge variant="cpi" size="sm">CPI</Badge>}
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
