'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname.startsWith('/dashboard/') || pathname === '/admin' || pathname.startsWith('/admin/');
  if (isDashboard) return <main className="flex-1">{children}</main>;
  return <><Header /><main className="flex-1">{children}</main><Footer /></>;
}
