import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, AlertCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Terms of Service | CPI Lancers',
  description:
    'Terms of Service for CPI Lancers. Official marketplace terms are currently undergoing corporate legal review.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12">
        {/* Header */}
        <div className="border-b border-slate-100 pb-8 mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold mb-4">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Pending Corporate & Legal Approval</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Status: Draft under review | Updated: October 2026
          </p>
        </div>

        {/* Notice Box */}
        <div className="bg-amber-50/60 rounded-xl p-5 border border-amber-200 mb-8 flex items-start gap-3">
          <FileText className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 leading-relaxed space-y-1">
            <p className="font-semibold">Notice Regarding Platform Terms</p>
            <p>
              The definitive CPI Lancers Terms of Service, client agreements, consultant terms, and
              intellectual property policies are currently undergoing formal legal and regulatory review.
              Specific legal clauses and binding agreements will be published following final corporate approval.
            </p>
          </div>
        </div>

        {/* Informational Overview */}
        <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-slate-900 mb-2">
              Platform Overview
            </h2>
            <p>
              CPI Lancers is being developed as a specialized marketplace connecting enterprise clients
              with SAP Cloud Integration (CPI) and SAP Integration Suite consultants. When finalized,
              the Terms of Service will govern user eligibility, account responsibilities, milestone contract
              frameworks, payment handling, and platform dispute mechanisms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-900 mb-2">
              Engagement Inquiries
            </h2>
            <p>
              For enterprise contract inquiries, custom master services agreements (MSAs), or questions
              regarding platform terms, please contact our legal and support team:
            </p>
            <div className="mt-3">
              <a
                href="mailto:support@cpilancers.com"
                className="inline-flex items-center gap-2 text-[#0a4d8c] font-medium hover:underline"
              >
                <Mail className="w-4 h-4" />
                support@cpilancers.com
              </a>
            </div>
          </section>
        </div>

        {/* Footer actions */}
        <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/privacy" className="text-xs text-slate-500 hover:text-slate-900 transition-colors">
            View Privacy Policy &rarr;
          </Link>
          <div className="flex gap-3">
            <Link href="/">
              <Button size="sm" variant="outline">Return Home</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
