import type { Metadata } from 'next';
import { AppChrome } from '@/components/layout/app-chrome';
import './globals.css';

export const metadata: Metadata = {
  title: 'CPI Lancers | Integration Marketplace',
  description:
    'CPI Lancers connects clients with elite, verified SAP Cloud Integration (CPI) and SAP Integration Suite consultants for mission-critical enterprise projects.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex flex-col min-h-full antialiased bg-slate-50 text-slate-900">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
