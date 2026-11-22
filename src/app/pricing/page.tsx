import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, Building2, UserCheck, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Pricing | CPI Lancers',
  description:
    'Platform pricing for CPI Lancers. Official marketplace fee schedules and enterprise terms are currently being finalized.',
  robots: 'noindex',
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Payment Notice */}
        <div className="mb-8 bg-amber-50/80 rounded-xl p-5 border border-amber-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 leading-relaxed space-y-1">
            <p className="font-semibold">Payments & Escrow Not Yet Available</p>
            <p>
              Marketplace payment features (escrow, milestone funding, payouts) are not yet live.
              They will launch in a later phase. The fee schedules below are for planning purposes only
              and will be finalized upon commercial release.
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            Marketplace Pricing
          </h1>
          <p className="mt-3 text-base text-slate-600">
            CPI Lancers is structured around milestone-based engagements for SAP integration projects.
            Commercial fee structures and enterprise terms are currently being finalized.
          </p>
        </div>

        {/* Engagement Model Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* For Clients */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="p-2.5 rounded-xl bg-blue-50 text-[#365cf5] w-fit mb-3">
                <Building2 className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">For Clients</h2>
              <p className="text-xs text-slate-500 mt-1 mb-4">Enterprise SAP Integration Hiring</p>
              <ul className="space-y-2 text-xs text-slate-600">
                <li>• Commercial posting terms will be published after approval.</li>
                <li>• Milestone structures are subject to finalized engagement terms.</li>
                <li>• Enterprise billing options are under development.</li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <Link href="/jobs/create">
                <Button size="sm" variant="primary" className="w-full justify-center">
                  Post Requirement
                </Button>
              </Link>
            </div>
          </div>

          {/* For Consultants */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 w-fit mb-3">
                <UserCheck className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">For Consultants</h2>
              <p className="text-xs text-slate-500 mt-1 mb-4">SAP CPI & Integration Specialists</p>
              <ul className="space-y-2 text-xs text-slate-600">
                <li>• Commercial profile and proposal terms will be published after approval.</li>
                <li>• Rate fields are shown for marketplace planning; final treatment is pending.</li>
                <li>• Platform disbursement guidelines are under review.</li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <Link href="/register">
                <Button size="sm" variant="outline" className="w-full justify-center">
                  Join as Consultant
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Enterprise Inquiries Box */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <h3 className="font-semibold text-slate-900 text-sm mb-1">Commercial & Enterprise Inquiries</h3>
          <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
            For specific pricing questions, enterprise master services agreements, or custom billing requirements:
          </p>
          <a
            href="mailto:support@cpilancers.com"
            className="inline-flex items-center gap-2 text-xs text-[#365cf5] hover:text-[#2445c7] font-medium hover:underline"
          >
            <Mail className="w-3.5 h-3.5" />
            support@cpilancers.com
          </a>
        </div>
      </div>
    </div>
  );
}
