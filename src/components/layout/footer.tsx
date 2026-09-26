import * as React from 'react';
import Link from 'next/link';
import { Layers } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 bg-white text-slate-600 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#0a4d8c] flex items-center justify-center text-white font-bold text-sm">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-bold text-base text-slate-900">
                CPI <span className="text-[#0284c7]">Lancers</span>
              </span>
            </div>
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
                <Link href="/jobs/new" className="hover:text-slate-900 transition-colors">
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
