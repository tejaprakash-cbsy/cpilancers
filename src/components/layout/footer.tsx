import * as React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-[#dde1e7] bg-white text-[#667085] text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex">
              <Logo size={32} />
            </Link>
            <p className="text-xs text-slate-500 leading-relaxed">
              The premier B2B freelance marketplace dedicated to SAP Cloud Integration (CPI)
              and SAP Integration Suite specialists.
            </p>
            <div className="text-xs text-slate-400">
              © {new Date().getFullYear()} CPI Lancers. All rights reserved.
            </div>
          </div>

          {/* For Clients */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3 text-xs uppercase tracking-wider">
              For Clients
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/consultants" className="hover:text-slate-900 transition-colors">
                  Browse SAP CPI Consultants
                </Link>
              </li>
              <li>
                <Link href="/jobs/create" className="hover:text-slate-900 transition-colors">
                  Post an Integration Requirement
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-slate-900 transition-colors">
                  Escrow & Milestone Protection
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-slate-900 transition-colors">
                  Transparent Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* For Consultants */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3 text-xs uppercase tracking-wider">
              For Consultants
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/jobs" className="hover:text-slate-900 transition-colors">
                  Browse Open Integration Jobs
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-slate-900 transition-colors">
                  Create Consultant Profile
                </Link>
              </li>
              <li>
                <Link href="/certifications" className="hover:text-slate-900 transition-colors">
                  SAP Certification Verification
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-slate-900 transition-colors">
                  Direct Payouts & Low Fees
                </Link>
              </li>
            </ul>
          </div>

          {/* SAP Ecosystem */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3 text-xs uppercase tracking-wider">
              SAP Ecosystem
            </h4>
            <ul className="space-y-2 text-xs">
              <li className="text-slate-500">SAP Cloud Integration (CPI)</li>
              <li className="text-slate-500">SAP S/4HANA & ECC Integration</li>
              <li className="text-slate-500">SAP SuccessFactors & Ariba</li>
              <li className="text-slate-500">API Management & Event Mesh</li>
              <li className="text-slate-500">IDoc, OData, SOAP & REST</li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
