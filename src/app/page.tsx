import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  MessageSquare,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Logo } from '@/components/brand/logo';
import { JobService, PUBLICLY_LISTABLE_JOB_STATUSES } from '@/services/job.service';
import { ForumService, type DiscussionWithAuthor } from '@/services/forum.service';
import { formatRelativeTime } from '@/lib/utils';
import type { Job } from '@/types/database';

const expertise = [
  ['Design & Creative', 'Brand, product, and visual systems'],
  ['Development', 'Web, mobile, and software delivery'],
  ['Data & AI', 'Analytics, automation, and intelligence'],
  ['Marketing', 'Growth, content, and performance'],
  ['Consulting', 'Strategy, operations, and finance'],
  ['Writing & Translation', 'Words that move work forward'],
  ['Support & Operations', 'Reliable day-to-day execution'],
  ['Legal & Finance', 'Specialists for the details'],
];

const process = [
  ['Share the goal', 'Tell us what you need and the kind of expertise that will make it happen.'],
  ['Meet strong matches', 'Review thoughtful proposals from people who fit your brief.'],
  ['Work with confidence', 'Clear terms, protected payments, and support when you need it.'],
];

export default async function HomePage() {
  let recentJobs: Job[] = [];
  try {
    const result = await JobService.getJobs({
      page: 1,
      limit: 3,
      allowedStatuses: PUBLICLY_LISTABLE_JOB_STATUSES,
    });
    recentJobs = result.jobs;
  } catch (error) {
    console.error('[HomePage - Recent Jobs]:', error);
  }

  let recentDiscussions: DiscussionWithAuthor[] = [];
  try {
    const res = await ForumService.getDiscussions({ limit: 4 });
    recentDiscussions = res.discussions;
  } catch (error) {
    console.error('[HomePage - Recent Discussions]:', error);
  }

  return (
    <div className="bg-[#f5f6f8] text-[#172033]">
      <section className="bg-white">
        <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:py-[76px]">
          <div className="max-w-[560px]">
            <Badge variant="sap" className="mb-5">Free Community Forum Launch</Badge>
            <h1 className="max-w-[560px] text-[42px] font-normal leading-[1.08] tracking-[-1.5px] sm:text-[56px]">
              SAP Integration Community.<br />
              <span className="text-[#365cf5]">Discussions & Solutions.</span>
            </h1>
            <p className="mt-6 max-w-[500px] text-[16px] leading-7 text-[#667085]">
              CPI Lancers is now live as a free open forum for SAP Cloud Integration, Integration Suite, Groovy scripting, and enterprise middleware professionals.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/forum"><Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>Explore Community Forum</Button></Link>
              <Link href="/forum/new"><Button size="lg" variant="outline" leftIcon={<MessageSquare className="h-4 w-4" />}>Start a Discussion</Button></Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[#667085]">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#148267]" /> 100% Free Public Forum</span>
              <span className="flex items-center gap-1.5"><CircleCheck className="h-3.5 w-3.5 text-[#148267]" /> Expert Peer Answers</span>
              <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#148267]" /> CPI &amp; BTP Architecture</span>
            </div>
          </div>
          <div className="relative min-h-[390px] overflow-hidden rounded-[16px] bg-[#e7e9ee] sm:min-h-[500px]">
            <Image
              src="/landing-assets/landing-01.png"
              alt="A team collaborating around a table"
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <Card className="absolute bottom-5 left-5 right-5 flex items-center gap-3 border-white/80 bg-white/95 p-3 shadow-lg backdrop-blur sm:left-8 sm:right-8">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">Have an SAP CPI question?</p>
                <p className="truncate text-[11px] text-[#667085]">Ask the community or browse existing architectural discussions.</p>
              </div>
              <Link href="/forum/new"><Button size="sm">Ask a Question</Button></Link>
            </Card>
          </div>
        </div>
      </section>

      {/* Featured Forum Discussions Section */}
      <section className="border-t border-[#dde1e7] bg-white py-12">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
          <div className="mb-8 flex items-end justify-between gap-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Community Hub</p>
              <h2 className="mt-1 text-[26px] font-normal">Latest Forum Discussions</h2>
              <p className="mt-1 text-xs text-[#667085]">Join real conversations with SAP integration engineers and consultants.</p>
            </div>
            <Link href="/forum" className="hidden items-center gap-1 text-xs font-semibold text-[#365cf5] sm:flex">
              View all discussions <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {recentDiscussions.length > 0 ? (
              recentDiscussions.map((d) => (
                <Link key={d.id} href={`/forum/${d.id}`} className="block">
                  <Card className="p-5 h-full transition hover:-translate-y-0.5 hover:border-[#365cf5]/50 hover:shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      {d.is_pinned && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          Pinned
                        </span>
                      )}
                      {d.category?.name && (
                        <span className="text-[10px] font-semibold text-[#365cf5] bg-[#eef1ff] px-2 py-0.5 rounded">
                          {d.category.name}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm text-[#172033] line-clamp-1">{d.title}</h3>
                    <p className="mt-1 text-xs text-[#667085] line-clamp-2 leading-relaxed">{d.body}</p>
                    <div className="mt-4 pt-2 border-t border-[#f0f2f5] flex items-center justify-between text-[11px] text-[#667085]">
                      <span>{d.author?.display_name || 'Community Member'}</span>
                      <div className="flex items-center gap-2">
                        <span>{formatRelativeTime(d.created_at)}</span>
                        <span>•</span>
                        <span>{d.reply_count} {d.reply_count === 1 ? 'reply' : 'replies'}</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))
            ) : (
              <Card className="col-span-2 p-8 text-center">
                <MessageSquare className="w-8 h-8 text-[#667085]/40 mx-auto mb-2" />
                <p className="text-sm font-medium text-[#172033]">The forum is open for discussions!</p>
                <p className="mt-1 text-xs text-[#667085]">Be the first to ask an SAP CPI or integration question.</p>
                <div className="mt-4">
                  <Link href="/forum/new"><Button size="sm">Create First Topic</Button></Link>
                </div>
              </Card>
            )}
          </div>
        </div>
      </section>

      <div className="bg-[#111827] text-white"><div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-4 text-[11px] sm:px-10"><span>Built for SAP integration teams</span><div className="flex flex-wrap gap-6 text-white/60"><span>Cloud Integration</span><span>Integration Suite</span><span>API Management</span><span>Event Mesh</span></div></div></div>

      <section className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="mb-8 flex items-end justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Expertise</p><h2 className="mt-2 text-[30px] font-normal">Expertise for every stage of growth</h2><p className="mt-2 text-sm text-[#667085]">Whatever you are building, find the right specialist to move it forward.</p></div><Link href="/consultants" className="hidden items-center gap-1 text-xs font-semibold text-[#365cf5] sm:flex">Explore talent <ChevronRight className="h-4 w-4" /></Link></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{expertise.map(([title, description]) => <Card key={title} className="group p-5 transition hover:-translate-y-0.5 hover:border-[#365cf5]/40 hover:shadow-sm"><div className="mb-7 flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#eef1ff] text-[#365cf5]"><Zap className="h-4 w-4" /></div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-[11px] leading-5 text-[#667085]">{description}</p><span className="mt-4 block text-xs text-[#365cf5] opacity-0 transition group-hover:opacity-100">View specialists <ArrowRight className="ml-1 inline h-3 w-3" /></span></Card>)}</div></section>

      <section className="border-y border-[#dde1e7] bg-white"><div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="mb-8 flex items-end justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Talent</p><h2 className="mt-2 text-[30px] font-normal">Talent with the receipts</h2><p className="mt-2 text-sm text-[#667085]">Meet independent professionals with the experience to make an immediate impact.</p></div><Link href="/consultants" className="hidden items-center gap-1 text-xs font-semibold text-[#365cf5] sm:flex">View all talent <ChevronRight className="h-4 w-4" /></Link></div><div className="grid gap-4 lg:grid-cols-3"><Card className="lg:col-span-3"><p className="text-sm text-[#667085]">No consultant profiles to show yet. Public profiles appear here once consultants complete theirs.</p><div className="mt-4"><Link href="/register"><Button size="sm">Create a consultant profile</Button></Link></div></Card></div></div></section>

      <section className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="grid gap-8 lg:grid-cols-[0.8fr_1.4fr]"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Projects</p><h2 className="mt-2 max-w-[340px] text-[30px] font-normal">Projects worth your best work</h2><p className="mt-3 max-w-[320px] text-sm leading-6 text-[#667085]">Find thoughtful briefs from teams who value quality, clarity, and the people doing the work.</p><Link href="/jobs" className="mt-6 inline-block"><Button size="sm">Browse open jobs <ArrowRight className="ml-1 h-4 w-4" /></Button></Link></div><div className="space-y-3">{recentJobs.length > 0 ? recentJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} className="block"><Card className="p-5 transition hover:border-[#365cf5]/50 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="text-sm font-semibold">{job.title}</h3><p className="mt-2 text-[11px] text-[#667085]">{job.integration_type.replace(/_/g, ' ')} <span className="mx-1">·</span> {formatRelativeTime(job.created_at)}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-[#667085]" /></div><div className="mt-4 flex items-center justify-between text-[11px] text-[#667085]"><span>{job.proposals_count} proposals</span><span>{job.estimated_duration_weeks} {job.estimated_duration_weeks === 1 ? 'week' : 'weeks'}</span></div></Card></Link>) : <Card className="p-5"><p className="text-sm text-[#667085]">No open projects to show yet.</p><div className="mt-4"><Link href="/jobs"><Button size="sm">Browse all jobs</Button></Link></div></Card>}</div></div></section>

      <section className="border-y border-[#dde1e7] bg-white"><div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="mx-auto max-w-[500px] text-center"><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">How it works</p><h2 className="mt-2 text-[30px] font-normal">A clearer path from search to success</h2><p className="mt-3 text-sm text-[#667085]">Simple by design. Serious about the outcome.</p></div><div className="mt-10 grid gap-4 lg:grid-cols-3">{process.map(([title, description], index) => <div key={title} className="rounded-[16px] p-6 bg-[#f5f6f8] transition-all duration-300 hover:-translate-y-2 hover:shadow-md hover:bg-white"><div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold bg-[#eef1ff] text-[#365cf5]">{index + 1}</div><h3 className="mt-8 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-[#667085]">{description}</p></div>)}</div></div></section>

      <section className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]"><div className="relative overflow-hidden rounded-[16px]"><Image
              src="/landing-assets/landing-09.png"
              alt="Professional working from home"
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="aspect-square h-full w-full object-cover"
              priority
            /></div><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Built for trust</p><h2 className="mt-2 text-[30px] font-normal">Good work needs a strong foundation.</h2><p className="mt-4 max-w-[490px] text-sm leading-6 text-[#667085]">The right relationship makes ambitious work feel possible. Lancers gives every project the structure and confidence to do its best work.</p><ul className="mt-7 space-y-4 text-sm">{['Vetted, verified professionals', 'Protected payments and milestones', 'Transparent terms and communication', 'Support when the work gets complex'].map((item) => <li key={item} className="flex items-center gap-3"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e8f6f1] text-[#148267]"><Check className="h-3 w-3" /></span>{item}</li>)}</ul></div></div></section>

      <section className="bg-[#365cf5] text-white"><div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-6 px-6 py-7 sm:grid-cols-4 sm:px-10"><div><p className="text-2xl font-normal">—</p><p className="mt-1 text-[11px] text-white/70">Professionals</p></div><div><p className="text-2xl font-normal">—</p><p className="mt-1 text-[11px] text-white/70">Match satisfaction</p></div><div><p className="text-2xl font-normal">—</p><p className="mt-1 text-[11px] text-white/70">Countries connected</p></div><div><p className="text-2xl font-normal">—</p><p className="mt-1 text-[11px] text-white/70">Average rating</p></div></div></section>

      <section className="bg-white"><div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="mb-8 text-center"><h2 className="text-[30px] font-normal">Trusted where the work gets serious</h2><p className="mt-2 text-sm text-[#667085]">A few words from the people building with Lancers.</p></div><div className="grid gap-4 lg:grid-cols-3"><Card className="lg:col-span-3"><p className="text-sm text-[#667085]">No reviews yet.</p></Card></div></div></section>

      <section className="bg-[#111827] text-white"><div className="mx-auto max-w-[1280px] px-6 py-14 sm:px-10"><div className="flex flex-col justify-between gap-7 md:flex-row md:items-end"><div><h2 className="max-w-[400px] text-[30px] font-normal">Your next great working relationship starts here.</h2><p className="mt-3 text-sm text-white/60">Find the people and projects that make the work worth doing.</p></div><div className="flex gap-3"><Link href="/register"><Button size="sm">Get started</Button></Link><Link href="/jobs"><Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">Explore jobs</Button></Link></div></div><div className="mt-16 grid gap-8 border-t border-white/10 pt-8 sm:grid-cols-4"><div><Link href="/" className="inline-flex"><Logo size={28} variant="dark" /></Link><p className="mt-3 max-w-[220px] text-[11px] leading-5 text-white/45">A better way to find the people and projects that move work forward.</p></div><div><p className="text-xs font-semibold">For clients</p><div className="mt-3 space-y-2 text-[11px] text-white/55"><Link className="block hover:text-white" href="/consultants">Find talent</Link><Link className="block hover:text-white" href="/jobs/create">Post a project</Link><Link className="block hover:text-white" href="/how-it-works">How it works</Link></div></div><div><p className="text-xs font-semibold">For freelancers</p><div className="mt-3 space-y-2 text-[11px] text-white/55"><Link className="block hover:text-white" href="/jobs">Find work</Link><Link className="block hover:text-white" href="/register">Create a profile</Link><Link className="block hover:text-white" href="/how-it-works">Resources</Link></div></div><div><p className="text-xs font-semibold">Company</p><div className="mt-3 space-y-2 text-[11px] text-white/55"><Link className="block hover:text-white" href="/">About Lancers</Link><Link className="block hover:text-white" href="/pricing">Pricing</Link><Link className="block hover:text-white" href="/">Contact</Link></div></div></div></div></section>
    </div>
  );
}
