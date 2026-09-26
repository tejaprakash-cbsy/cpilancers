/**
 * Auth Layout
 * Simplified layout for authentication pages (no header/footer)
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication | CPI Lancers',
  description: 'Sign in or create an account on the CPI Lancers SAP Integration Marketplace',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {children}
    </div>
  );
}
