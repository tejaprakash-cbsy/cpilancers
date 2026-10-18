import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FileEdit,
  Users2,
  CheckCircle,
  Search,
  Send,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'How It Works | CPI Lancers',
  description:
    'Overview of the CPI Lancers engagement model connecting clients with SAP Cloud Integration consultants.',
};

export default function HowItWorksPage() {
  const clientSteps = [
    {
      step: '01',
      title: 'Post Integration Requirement',
      description:
        'Outline your SAP integration landscape, technical deliverables (iFlows, Groovy scripts, mappings), and project timeline.',
      icon: FileEdit,
    },
    {
      step: '02',
      title: 'Review Proposals',
      description:
        'Evaluate proposals from SAP integration specialists, comparing architecture approaches, experience, and milestone estimates.',
      icon: Users2,
    },
    {
      step: '03',
      title: 'Structure Milestones',
      description:
        'Agree on project milestones, deliverables, and acceptance criteria before technical execution begins.',
      icon: Layers,
    },
    {
      step: '04',
      title: 'Review & Complete',
      description:
        'Inspect completed integration packages, verify testing in your subaccount/tenant, and sign off on milestone completion.',
      icon: CheckCircle,
    },
  ];

  const consultantSteps = [
    {
      step: '01',
      title: 'Create Specialist Profile',
      description:
        'Detail your SAP Integration Suite competencies, technical modules, certifications, and past delivery experience.',
      icon: Search,
    },
    {
      step: '02',
      title: 'Browse Integration Jobs',
      description:
        'Discover enterprise requirements posted by businesses seeking dedicated SAP CPI and BTP integration skills.',
      icon: Send,
    },
    {
      step: '03',
      title: 'Submit Structured Proposals',
      description:
        'Provide technical implementation outlines, deliverable estimates, and milestone schedules.',
      icon: Layers,
    },
    {
      step: '04',
      title: 'Deliver & Build Reputation',
      description:
        'Execute integration flows, document mapping specifications, and build your marketplace profile.',
      icon: CheckCircle,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            How CPI Lancers Works
          </h1>
          <p className="mt-3 text-base text-slate-600">
            An informational overview of the planned marketplace workflow for SAP Cloud Integration and SAP Integration Suite engagements.
          </p>
        </div>

        {/* Section For Clients */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-200">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#365cf5]">Client Journey</span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">For Enterprise Clients</h2>
            </div>
            <Link href="/jobs/create">
              <Button size="sm" variant="primary">Post a Project &rarr;</Button>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {clientSteps.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xl font-bold text-slate-300">{item.step}</span>
                      <div className="p-2 rounded-lg bg-blue-50 text-[#365cf5]">
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm mb-1.5">{item.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section For Consultants */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-200">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Consultant Journey</span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">For SAP Consultants</h2>
            </div>
            <Link href="/jobs">
              <Button size="sm" variant="outline">Browse Jobs &rarr;</Button>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {consultantSteps.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xl font-bold text-slate-300">{item.step}</span>
                      <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm mb-1.5">{item.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Call to action */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Ready to explore SAP integration opportunities?</h2>
          <p className="text-xs text-slate-600 max-w-lg mx-auto mb-6">
            Join the platform to connect with certified SAP integration specialists or discover enterprise project scopes.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/register">
              <Button variant="primary" size="md">
                Get Started <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
            <Link href="/consultants">
              <Button variant="outline" size="md">
                Browse Talent
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
