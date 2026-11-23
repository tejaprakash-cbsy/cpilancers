import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Contact Us | CPI Lancers',
  description: 'Get in touch with the CPI Lancers team for enterprise integrations, account assistance, or platform inquiries.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#f5f6f8] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-medium text-[#172033]">Contact CPI Lancers</h1>
          <p className="text-sm text-[#667085] max-w-xl mx-auto">
            Have questions about hiring SAP integration talent, managing contracts, or your consultant profile? We are here to help.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card className="border-[#dde1e7] shadow-sm">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-[#365cf5] mb-2">
                <Mail className="w-5 h-5" />
              </div>
              <CardTitle className="text-lg font-medium text-[#172033]">Direct Support</CardTitle>
              <CardDescription className="text-xs text-[#667085]">
                Account issues, billing questions, or platform inquiries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <span className="block text-xs font-medium text-[#667085]">Email</span>
                <a
                  href="mailto:support@cpilancers.com"
                  className="font-medium text-[#365cf5] hover:underline"
                >
                  support@cpilancers.com
                </a>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#667085]">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Response time: within 1 business day</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#dde1e7] shadow-sm">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-[#365cf5] mb-2">
                <MessageSquare className="w-5 h-5" />
              </div>
              <CardTitle className="text-lg font-medium text-[#172033]">Community Forum</CardTitle>
              <CardDescription className="text-xs text-[#667085]">
                Technical discussions, iFlow advice, and Groovy script help.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-xs text-[#667085]">
                Connect with peer SAP consultants and post questions in our community forum.
              </p>
              <Link href="/forum">
                <Button variant="outline" size="sm" className="w-full justify-center">
                  Visit Forum <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-xl border border-[#dde1e7] bg-white p-6 text-center space-y-3">
          <h2 className="text-base font-medium text-[#172033]">Looking to learn more about the platform?</h2>
          <p className="text-xs text-[#667085] max-w-lg mx-auto">
            Explore our guide on how clients hire verified SAP specialists and how consultants deliver enterprise integration projects.
          </p>
          <div className="pt-2">
            <Link href="/how-it-works">
              <Button variant="primary" size="sm">
                How It Works
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
