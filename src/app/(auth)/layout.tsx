import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, MessageSquareText } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

export const metadata: Metadata = {
  title: 'Authentication | CPI Lancers',
  description: 'Sign in or create an account on the CPI Lancers SAP Integration platform',
};

const VALUE_POINTS = [
  {
    icon: MessageSquareText,
    title: 'SAP CPI & Integration Suite community forum',
    detail: 'Peer-reviewed Groovy scripts, iFlow patterns, and architecture discussions.',
  },
  {
    icon: BadgeCheck,
    title: 'Verified SAP consultant profiles',
    detail: 'Showcase Integration Suite skills, certifications, and project experience.',
  },
  {
    icon: BriefcaseBusiness,
    title: 'Direct enterprise project discovery',
    detail: 'Connect directly with organizations hiring SAP integration specialists.',
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-12">
      {/* Left Brand Panel (Desktop) */}
      <aside className="relative hidden overflow-hidden border-r border-slate-200/80 bg-[#f4f6fb] p-10 lg:col-span-5 lg:flex lg:flex-col lg:justify-between xl:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-[#365cf5]/[0.08] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-[#365cf5]/[0.06] blur-3xl"
        />

        <div className="relative z-10">
          <Link
            href="/"
            className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40"
          >
            <Logo size={36} variant="light" />
          </Link>
        </div>

        <div className="relative z-10 my-10 space-y-8">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 leading-tight">
              The technical home for SAP Integration professionals.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Built for SAP Cloud Integration, PI/PO, and Integration Suite practitioners across
              India and global enterprise teams.
            </p>
          </div>

          <ul className="space-y-4">
            {VALUE_POINTS.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-[#365cf5] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-6 text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} CPI Lancers</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-slate-900 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-900 transition-colors">
              Terms
            </Link>
            <Link href="/contact" className="hover:text-slate-900 transition-colors">
              Contact
            </Link>
          </div>
        </footer>
      </aside>

      {/* Right Form Panel */}
      <div className="flex min-h-screen flex-col bg-white lg:col-span-7">
        <header className="flex items-center justify-between px-6 py-5 sm:px-10">
          <Link
            href="/"
            className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40 lg:invisible"
          >
            <Logo size={32} variant="light" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 pb-12 pt-4 sm:px-10">
          {children}
        </div>
      </div>
    </div>
  );
}
