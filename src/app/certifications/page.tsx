import type { Metadata } from 'next';
import Link from 'next/link';
import { Award, AlertCircle, Search, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Certifications | CPI Lancers',
  description:
    'SAP certification references for CPI Lancers. Verification guidelines are currently being established.',
};

export default function CertificationsPage() {
  const commonCredentials = [
    {
      code: 'C_CPE_16',
      title: 'SAP Certified Associate – Integration Developer',
      focus: 'SAP Integration Suite, Cloud Integration (CPI), Open Connectors, API Management',
    },
    {
      code: 'C_CPE_15',
      title: 'SAP Certified Development Associate – SAP BTP Extension Suite',
      focus: 'BTP core services, Event Mesh, Cloud Application Programming (CAP)',
    },
    {
      code: 'C_CPI_14',
      title: 'SAP Certified Development Associate – SAP Cloud Platform Integration',
      focus: 'Cloud Integration architecture, security artifacts, Groovy scripting',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold mb-4">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Verification Guidelines in Development</span>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            SAP Certification Program
          </h1>
          <p className="mt-3 text-base text-slate-600">
            The following SAP certification references are provided for review while marketplace verification guidelines are being established.
          </p>
        </div>

        {/* Notice Box */}
        <div className="bg-amber-50/60 rounded-xl p-5 border border-amber-200 mb-12 flex items-start gap-3">
          <Award className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 leading-relaxed space-y-1">
            <p className="font-semibold">Certification Reference Review</p>
            <p>
              Credential validation protocols, accepted certification references, and any profile verification
              workflow are currently under review. This page does not represent accreditation or a verified credential.
            </p>
          </div>
        </div>

        {/* Focus Areas */}
        <div className="mb-12">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Relevant SAP Integration Certifications</h2>
          <div className="space-y-3">
            {commonCredentials.map((cert) => (
              <div
                key={cert.code}
                className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                      {cert.code}
                    </span>
                    <h3 className="font-semibold text-slate-900 text-sm">{cert.title}</h3>
                  </div>
                  <p className="text-xs text-slate-500">{cert.focus}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact box */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-sm">
          <h3 className="font-semibold text-slate-900 text-sm mb-1">Certification & Verification Inquiries</h3>
          <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
            If you are an SAP certified consultant or enterprise client seeking details on our upcoming verification standard:
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <a
              href="mailto:support@cpilancers.com"
              className="inline-flex items-center gap-1.5 text-xs text-[#0a4d8c] font-medium hover:underline"
            >
              <Mail className="w-3.5 h-3.5" />
              support@cpilancers.com
            </a>
            <Link href="/consultants">
              <Button size="sm" variant="outline">
                <Search className="w-3.5 h-3.5 mr-1" />
                Browse Directory
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
