import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Search,
  ShieldCheck,
  Star,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

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

const talent = [
  { image: '/landing-assets/landing-06.jpeg', name: 'Maya Chen', role: 'Product designer', rating: '4.9', rate: '$74/hr', tags: ['Figma', 'Design systems'] },
  { image: '/landing-assets/landing-07.jpeg', name: 'Emil Mensah', role: 'Data engineer', rating: '4.8', rate: '$82/hr', tags: ['Python', 'Data platforms'] },
  { image: '/landing-assets/landing-08.jpeg', name: 'Lucía Navarro', role: 'Brand strategist', rating: '5.0', rate: '$68/hr', tags: ['Brand', 'Go-to-market'] },
];

const projects = [
  ['Lead product designer for climate analytics platform', 'Design & Creative', '3 weeks ago', '12 proposals'],
  ['Senior React engineer for fintech dashboard', 'Development', '1 day ago', '8 proposals'],
  ['Lifecycle marketing audit and growth roadmap', 'Marketing', '5 days ago', '16 proposals'],
];

const process = [
  ['Share the goal', 'Tell us what you need and the kind of expertise that will make it happen.'],
  ['Meet strong matches', 'Review thoughtful proposals from people who fit your brief.'],
  ['Work with confidence', 'Clear terms, protected payments, and support when you need it.'],
];

export default function HomePage() {
  return (
    <div className="bg-[#f5f6f8] text-[#172033]">
      <section className="bg-white">
        <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:py-[76px]">
          <div className="max-w-[560px]">
            <Badge variant="sap" className="mb-5">The modern talent marketplace</Badge>
            <h1 className="max-w-[560px] text-[42px] font-normal leading-[1.08] tracking-[-1.5px] sm:text-[56px]">
              Exceptional work.<br />
              <span className="text-[#365cf5]">Without borders.</span>
            </h1>
            <p className="mt-6 max-w-[500px] text-[16px] leading-7 text-[#667085]">
              Lancers connects ambitious companies with proven independent professionals who bring clarity, craft, and momentum to every project.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register"><Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>Find your next hire</Button></Link>
              <Link href="/jobs"><Button size="lg" variant="outline" leftIcon={<Search className="h-4 w-4" />}>Explore projects</Button></Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[#667085]">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#148267]" /> Vetted professionals</span>
              <span className="flex items-center gap-1.5"><CircleCheck className="h-3.5 w-3.5 text-[#148267]" /> Secure payments</span>
              <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#148267]" /> Flexible terms</span>
            </div>
          </div>
          <div className="relative min-h-[390px] overflow-hidden rounded-[16px] bg-[#e7e9ee] sm:min-h-[500px]">
            <img src="/landing-assets/landing-01.png" alt="A team collaborating around a table" className="absolute inset-0 h-full w-full object-cover" />
            <Card className="absolute bottom-5 left-5 right-5 flex items-center gap-3 border-white/80 bg-white/95 p-3 shadow-lg backdrop-blur sm:left-8 sm:right-8">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef1ff] text-xs font-bold text-[#365cf5]">AM</div>
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold">Amina Mbaye</p><p className="truncate text-[11px] text-[#667085]">Senior product designer</p></div>
              <Badge variant="success" size="sm">Available</Badge>
            </Card>
          </div>
        </div>
      </section>

      <div className="bg-[#111827] text-white"><div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-4 text-[11px] sm:px-10"><span>Trusted by teams building what comes next</span><div className="flex flex-wrap gap-6 text-white/60"><span>Northstar</span><span>vertex</span><span>MONUMENT</span><span>daylight</span><span>RIVET</span></div></div></div>

      <section className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="mb-8 flex items-end justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Expertise</p><h2 className="mt-2 text-[30px] font-normal">Expertise for every stage of growth</h2><p className="mt-2 text-sm text-[#667085]">Whatever you are building, find the right specialist to move it forward.</p></div><Link href="/consultants" className="hidden items-center gap-1 text-xs font-semibold text-[#365cf5] sm:flex">Explore talent <ChevronRight className="h-4 w-4" /></Link></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{expertise.map(([title, description]) => <Card key={title} className="group p-5 transition hover:-translate-y-0.5 hover:border-[#365cf5]/40 hover:shadow-sm"><div className="mb-7 flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#eef1ff] text-[#365cf5]"><Zap className="h-4 w-4" /></div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-[11px] leading-5 text-[#667085]">{description}</p><span className="mt-4 block text-xs text-[#365cf5] opacity-0 transition group-hover:opacity-100">View specialists <ArrowRight className="ml-1 inline h-3 w-3" /></span></Card>)}</div></section>

      <section className="border-y border-[#dde1e7] bg-white"><div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="mb-8 flex items-end justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Talent</p><h2 className="mt-2 text-[30px] font-normal">Talent with the receipts</h2><p className="mt-2 text-sm text-[#667085]">Meet independent professionals with the experience to make an immediate impact.</p></div><Link href="/consultants" className="hidden items-center gap-1 text-xs font-semibold text-[#365cf5] sm:flex">View all talent <ChevronRight className="h-4 w-4" /></Link></div><div className="grid gap-4 lg:grid-cols-3">{talent.map((person) => <Card key={person.name} className="overflow-hidden p-0"><div className="flex gap-4 p-5"><img src={person.image} alt={person.name} className="h-14 w-14 rounded-full object-cover" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="truncate text-sm font-semibold">{person.name}</h3><span className="text-xs font-medium">{person.rate}</span></div><p className="mt-1 text-xs text-[#667085]">{person.role}</p><p className="mt-2 flex items-center gap-1 text-[11px]"><Star className="h-3.5 w-3.5 fill-[#f6b44b] text-[#f6b44b]" /> {person.rating} <span className="text-[#98a2b3]">· Verified</span></p></div></div><div className="flex gap-2 px-5 pb-4">{person.tags.map((tag) => <Badge key={tag} variant="default" size="sm">{tag}</Badge>)}</div><div className="flex gap-2 border-t border-[#dde1e7] p-4"><Link href="/consultants" className="flex-1"><Button variant="outline" size="sm" className="w-full">View profile</Button></Link><Link href="/register" className="flex-1"><Button size="sm" className="w-full">Start a conversation</Button></Link></div></Card>)}</div></div></section>

      <section className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="grid gap-8 lg:grid-cols-[0.8fr_1.4fr]"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Projects</p><h2 className="mt-2 max-w-[340px] text-[30px] font-normal">Projects worth your best work</h2><p className="mt-3 max-w-[320px] text-sm leading-6 text-[#667085]">Find thoughtful briefs from teams who value quality, clarity, and the people doing the work.</p><Link href="/jobs" className="mt-6 inline-block"><Button size="sm">Browse open jobs <ArrowRight className="ml-1 h-4 w-4" /></Button></Link></div><div className="space-y-3">{projects.map(([title, category, age, proposals]) => <Link key={title} href="/jobs" className="block"><Card className="p-5 transition hover:border-[#365cf5]/50 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-[11px] text-[#667085]">{category} <span className="mx-1">·</span> {age}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-[#667085]" /></div><div className="mt-4 flex items-center justify-between text-[11px] text-[#667085]"><span>{proposals}</span><span className="flex items-center gap-1 text-[#148267]"><BadgeCheck className="h-3.5 w-3.5" /> Verified client</span></div></Card></Link>)}</div></div></section>

      <section className="border-y border-[#dde1e7] bg-white"><div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="mx-auto max-w-[500px] text-center"><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">How it works</p><h2 className="mt-2 text-[30px] font-normal">A clearer path from search to success</h2><p className="mt-3 text-sm text-[#667085]">Simple by design. Serious about the outcome.</p></div><div className="mt-10 grid gap-4 lg:grid-cols-3">{process.map(([title, description], index) => <div key={title} className={`rounded-[16px] p-6 ${index === 1 ? 'bg-[#111827] text-white' : 'bg-[#f5f6f8]'}`}><div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${index === 1 ? 'bg-[#365cf5] text-white' : 'bg-[#eef1ff] text-[#365cf5]'}`}>{index + 1}</div><h3 className="mt-8 text-sm font-semibold">{title}</h3><p className={`mt-2 text-xs leading-5 ${index === 1 ? 'text-white/60' : 'text-[#667085]'}`}>{description}</p></div>)}</div></div></section>

      <section className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]"><div className="overflow-hidden rounded-[16px]"><img src="/landing-assets/landing-09.png" alt="Professional working from home" className="aspect-square h-full w-full object-cover" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Built for trust</p><h2 className="mt-2 text-[30px] font-normal">Good work needs a strong foundation.</h2><p className="mt-4 max-w-[490px] text-sm leading-6 text-[#667085]">The right relationship makes ambitious work feel possible. Lancers gives every project the structure and confidence to do its best work.</p><ul className="mt-7 space-y-4 text-sm">{['Vetted, verified professionals', 'Protected payments and milestones', 'Transparent terms and communication', 'Support when the work gets complex'].map((item) => <li key={item} className="flex items-center gap-3"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e8f6f1] text-[#148267]"><Check className="h-3 w-3" /></span>{item}</li>)}</ul></div></div></section>

      <section className="bg-[#365cf5] text-white"><div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-6 px-6 py-7 sm:grid-cols-4 sm:px-10"><div><p className="text-2xl font-normal">32k+</p><p className="mt-1 text-[11px] text-white/70">Professionals</p></div><div><p className="text-2xl font-normal">94%</p><p className="mt-1 text-[11px] text-white/70">Match satisfaction</p></div><div><p className="text-2xl font-normal">42</p><p className="mt-1 text-[11px] text-white/70">Countries connected</p></div><div><p className="text-2xl font-normal">4.8/5</p><p className="mt-1 text-[11px] text-white/70">Average rating</p></div></div></section>

      <section className="bg-white"><div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-10 lg:py-20"><div className="mb-8 text-center"><h2 className="text-[30px] font-normal">Trusted where the work gets serious</h2><p className="mt-2 text-sm text-[#667085]">A few words from the people building with Lancers.</p></div><div className="grid gap-4 lg:grid-cols-3">{[['“Lancers gave us a shortlist that felt considered, not just fast. We found the right person in days.”', 'Head of product, Northstar'], ['“The quality of the work and the quality of the communication are both unusually high.”', 'Founder, Vertex'], ['“Clear terms, strong talent, and a process that respects everyone’s time.”', 'COO, Monument']].map(([quote, author]) => <Card key={author} className="p-6"><div className="flex gap-1 text-[#f6b44b]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className="h-3.5 w-3.5 fill-current" />)}</div><p className="mt-5 text-sm leading-6 text-[#172033]">{quote}</p><p className="mt-6 text-[11px] text-[#667085]">{author}</p></Card>)}</div></div></section>

      <section className="bg-[#111827] text-white"><div className="mx-auto max-w-[1280px] px-6 py-14 sm:px-10"><div className="flex flex-col justify-between gap-7 md:flex-row md:items-end"><div><h2 className="max-w-[400px] text-[30px] font-normal">Your next great working relationship starts here.</h2><p className="mt-3 text-sm text-white/60">Find the people and projects that make the work worth doing.</p></div><div className="flex gap-3"><Link href="/register"><Button size="sm">Get started</Button></Link><Link href="/jobs"><Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">Explore jobs</Button></Link></div></div><div className="mt-16 grid gap-8 border-t border-white/10 pt-8 sm:grid-cols-4"><div><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white text-xs font-extrabold text-[#365cf5]">L</span><span className="text-sm">Lancers</span></div><p className="mt-3 max-w-[220px] text-[11px] leading-5 text-white/45">A better way to find the people and projects that move work forward.</p></div><div><p className="text-xs font-semibold">For clients</p><div className="mt-3 space-y-2 text-[11px] text-white/55"><Link className="block hover:text-white" href="/consultants">Find talent</Link><Link className="block hover:text-white" href="/jobs/create">Post a project</Link><Link className="block hover:text-white" href="/how-it-works">How it works</Link></div></div><div><p className="text-xs font-semibold">For freelancers</p><div className="mt-3 space-y-2 text-[11px] text-white/55"><Link className="block hover:text-white" href="/jobs">Find work</Link><Link className="block hover:text-white" href="/register">Create a profile</Link><Link className="block hover:text-white" href="/how-it-works">Resources</Link></div></div><div><p className="text-xs font-semibold">Company</p><div className="mt-3 space-y-2 text-[11px] text-white/55"><Link className="block hover:text-white" href="/">About Lancers</Link><Link className="block hover:text-white" href="/pricing">Pricing</Link><Link className="block hover:text-white" href="/">Contact</Link></div></div></div></div></section>
    </div>
  );
}
