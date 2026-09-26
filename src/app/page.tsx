import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Briefcase,
  Users,
  Shield,
  Zap,
  Code,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#0a4d8c] via-[#0a4d8c] to-[#0369a1] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-3xl">
            <Badge variant="cpi" className="mb-6 bg-white/10 text-white border-white/20">
              Specialized SAP CPI & Integration Suite Marketplace
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Connect with Elite{' '}
              <span className="text-[#7dd3fc]">SAP Integration</span> Consultants
            </h1>
            <p className="text-lg sm:text-xl text-blue-100 mb-8 leading-relaxed">
              The premier B2B freelance platform for hiring verified SAP Cloud Integration (CPI),
              Integration Suite, and enterprise middleware specialists. Secure escrow, milestone
              protection, and direct payouts.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/jobs">
                <Button
                  size="lg"
                  variant="secondary"
                  rightIcon={<Briefcase className="w-5 h-5" />}
                  className="w-full sm:w-auto"
                >
                  I need an SAP integration specialist
                </Button>
              </Link>
              <Link href="/consultants">
                <Button
                  size="lg"
                  variant="outline"
                  rightIcon={<Users className="w-5 h-5" />}
                  className="w-full sm:w-auto bg-white/10 text-white border-white/20 hover:bg-white/20"
                >
                  Browse SAP CPI consultants
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-[#0a4d8c]">300+</div>
              <div className="text-sm text-slate-600 mt-1">Verified SAP Consultants</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-[#0a4d8c]">$2.5M+</div>
              <div className="text-sm text-slate-600 mt-1">Contracts Completed</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-[#0a4d8c]">4.8/5</div>
              <div className="text-sm text-slate-600 mt-1">Average Rating</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-[#0a4d8c]">98%</div>
              <div className="text-sm text-slate-600 mt-1">Project Success Rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Why CPI Lancers?
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              The only marketplace purpose-built for SAP integration specialists and enterprise
              clients
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <Shield className="w-10 h-10 text-[#0a4d8c] mb-3" />
                <CardTitle>Verified SAP Expertise</CardTitle>
                <CardDescription>
                  All consultants are manually verified with SAP certification validation, portfolio
                  review, and technical vetting.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Zap className="w-10 h-10 text-[#0a4d8c] mb-3" />
                <CardTitle>Escrow-Protected Milestones</CardTitle>
                <CardDescription>
                  Payments held in secure escrow and released upon milestone approval. Full dispute
                  resolution support.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Code className="w-10 h-10 text-[#0a4d8c] mb-3" />
                <CardTitle>SAP-Native Workflow</CardTitle>
                <CardDescription>
                  Job postings structured around SAP systems, protocols (IDoc, OData, SOAP), and
                  integration patterns.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* SAP Technologies */}
      <section className="py-16 bg-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              SAP Integration Ecosystem
            </h2>
            <p className="text-lg text-slate-600">
              Expertise across the entire SAP integration technology stack
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              'SAP CPI',
              'API Management',
              'Event Mesh',
              'S/4HANA',
              'SuccessFactors',
              'Ariba',
              'OData V2/V4',
              'IDoc',
              'SOAP & REST',
              'Groovy Scripting',
            ].map((tech) => (
              <div
                key={tech}
                className="bg-white rounded-lg p-4 text-center font-medium text-sm text-slate-700 border border-slate-200 hover:border-[#0a4d8c] hover:shadow-sm transition-all"
              >
                {tech}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              How It Works
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* For Clients */}
            <div>
              <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <Briefcase className="w-6 h-6 text-[#0a4d8c]" />
                For Clients
              </h3>
              <div className="space-y-4">
                {[
                  'Post your SAP integration requirement with technical details',
                  'Receive proposals from verified CPI consultants within 24-48 hours',
                  'Review consultant portfolios, certifications, and client reviews',
                  'Select consultant and establish milestone-based contract',
                  'Funds held in escrow, released upon milestone approval',
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0a4d8c] text-white flex items-center justify-center text-sm font-bold">
                      {idx + 1}
                    </div>
                    <p className="text-slate-700">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* For Consultants */}
            <div>
              <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <Users className="w-6 h-6 text-[#0a4d8c]" />
                For Consultants
              </h3>
              <div className="space-y-4">
                {[
                  'Create comprehensive SAP profile with certifications and portfolio',
                  'Browse integration opportunities matching your expertise',
                  'Submit proposals with technical approach and pricing',
                  'Get hired and deliver milestone-based deliverables',
                  'Receive direct payouts upon client approval (5-10% platform fee)',
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0284c7] text-white flex items-center justify-center text-sm font-bold">
                      {idx + 1}
                    </div>
                    <p className="text-slate-700">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to Build Your Integration?
          </h2>
          <p className="text-lg text-slate-300 mb-8">
            Join the premier SAP integration talent marketplace today
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                Join as Client
              </Button>
            </Link>
            <Link href="/register?role=consultant">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto bg-white/10 text-white border-white/20 hover:bg-white/20"
              >
                Join as Consultant
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
