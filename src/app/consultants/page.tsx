'use client';

import Link from 'next/link';
import { ChevronDown, Search, SlidersHorizontal, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const SAP_DOMAINS = [
  'Cloud Integration (CPI)',
  'Integration Suite',
  'PI/PO Migration',
  'API Management',
  'Event Mesh',
  'Groovy & XSLT',
];

const FILTER_SECTIONS: Array<{ title: string; options: string[] }> = [
  {
    title: 'Availability',
    options: ['Available now', 'Open this week', 'Open this month'],
  },
  {
    title: 'Expertise level',
    options: ['Expert', 'Advanced', 'Intermediate'],
  },
  {
    title: 'Hourly rate (INR)',
    options: [
      '₹5,000+ / hr',
      '₹3,000 – ₹4,999 / hr',
      '₹1,500 – ₹2,999 / hr',
      'Under ₹1,500 / hr',
    ],
  },
  {
    title: 'Language',
    options: ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'German'],
  },
];

const INDIAN_HUB_LOCATIONS = [
  'Anywhere in India',
  'Bengaluru',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Mumbai',
  'Delhi NCR',
  'Kolkata',
  'Remote (India)',
  'Global / Remote',
];

export default function ConsultantsPage() {
  return (
    <main className="bg-[#f5f6f8]">
      <section className="border-b border-[#dde1e7] bg-white">
        <div className="mx-auto max-w-[1280px] px-6 py-10 sm:px-10">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">
                Consultant directory
              </p>
              <h1 className="mt-2 text-[32px] font-normal text-[#172033]">
                Find verified SAP integration consultants
              </h1>
              <p className="mt-2 text-sm text-[#667085]">
                Connect with India-based and global SAP CPI, Integration Suite, and PI/PO specialists
                aligned with IST (UTC+5:30) working hours.
              </p>
            </div>
            <Link href="/jobs/create">
              <Button size="sm">Post a job</Button>
            </Link>
          </div>

          <div className="mt-6 flex h-[58px] items-center gap-3 rounded-[10px] border border-[#dde1e7] bg-white p-2 shadow-sm">
            <Search className="ml-2 h-5 w-5 text-[#667085]" />
            <input
              placeholder="Search by SAP skill, adapter, certification, or name"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98a2b3]"
            />
            <Button size="sm">Search consultants</Button>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <Badge variant="sap" className="shrink-0">
              All consultants
            </Badge>
            {SAP_DOMAINS.map((domain) => (
              <Badge key={domain} variant="default" className="shrink-0">
                {domain}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1280px] gap-8 px-6 py-9 sm:px-10 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button type="button" className="text-[11px] text-[#365cf5] hover:underline">
                Clear all
              </button>
            </div>

            {FILTER_SECTIONS.map(({ title, options }) => (
              <div key={title} className="border-t border-[#dde1e7] py-4">
                <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#172033]">
                  {title}
                  <ChevronDown className="h-3.5 w-3.5 text-[#667085]" />
                </div>
                {options.map((option, index) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 py-1.5 text-[11px] text-[#667085]"
                  >
                    <input
                      type="checkbox"
                      defaultChecked={index === 0}
                      className="h-3.5 w-3.5 accent-[#365cf5]"
                    />
                    {option}
                  </label>
                ))}
              </div>
            ))}

            <div className="border-t border-[#dde1e7] pt-4">
              <label htmlFor="consultant-location" className="text-xs font-semibold text-[#172033]">
                Location
              </label>
              <select
                id="consultant-location"
                defaultValue="Anywhere in India"
                className="mt-3 h-10 w-full rounded-[10px] border border-[#dde1e7] bg-white px-3 text-xs text-[#172033] outline-none focus:border-[#365cf5]"
              >
                {INDIAN_HUB_LOCATIONS.map((hub) => (
                  <option key={hub} value={hub}>
                    {hub}
                  </option>
                ))}
              </select>
            </div>
          </Card>
        </aside>

        <div className="min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#172033]">Consultant Directory</h2>
              <p className="text-[11px] text-[#667085]">
                Verified SAP integration specialists across India and IST (UTC+5:30).
              </p>
            </div>
            <Button variant="outline" size="sm" className="lg:hidden">
              <SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> Filters
            </Button>
          </div>

          <Card className="mt-5 border-[#365cf5]/20 bg-white p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eef1ff] text-[#365cf5]">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-medium text-[#172033]">
              Founding SAP Consultant Directory
            </h3>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#667085]">
              Our verified SAP CPI consultant directory is onboarding its founding members. Complete
              your consultant profile to be listed, or join the community discussions in the forum.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/profile">
                <Button size="sm">Complete your profile</Button>
              </Link>
              <Link href="/forum">
                <Button variant="outline" size="sm">
                  Join forum discussions
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
