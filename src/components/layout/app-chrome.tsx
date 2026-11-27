'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

const CHROME_FREE_PREFIXES = [
  '/dashboard',
  '/admin',
  '/contracts',
  '/login',
  '/register',
  '/reset-password',
  '/verify-email',
  '/auth-error',
  '/auth',
];

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChromeFreeRoute = CHROME_FREE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (isChromeFreeRoute) return <main className="flex-1">{children}</main>;
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
