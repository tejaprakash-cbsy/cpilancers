import Link from 'next/link';
import { Bookmark, CheckCircle2 } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';

interface JobCardProps {
  job: { id: string; title: string; description_markdown: string; integration_type: string; source_systems: string[]; target_systems: string[]; protocols: string[]; estimated_duration_weeks: number; budget_type: string; budget_fixed_cents: number | null; budget_min_cents: number | null; budget_max_cents: number | null; status: string; views_count: number; proposals_count: number; client: { user_id: string; profiles: { first_name: string; last_name: string; display_name: string; avatar_url: string | null } | null } | null; company: { legal_name: string; brand_name: string | null; industry: string; company_size: string; logo_url: string | null } | null; created_at: string };
  showActions?: boolean;
  className?: string;
}
export type JobCardJob = JobCardProps['job'];

export default function JobCard({ job, showActions = false, className = '' }: JobCardProps) {
  const budget = job.budget_type === 'fixed_price' && job.budget_fixed_cents !== null ? formatCurrency(job.budget_fixed_cents) : job.budget_type === 'range' && job.budget_min_cents !== null && job.budget_max_cents !== null ? `${formatCurrency(job.budget_min_cents)}–${formatCurrency(job.budget_max_cents)}` : 'Hourly rate';
  const company = job.company?.brand_name || job.company?.legal_name || 'Independent client';
  const description = job.description_markdown.length > 180 ? `${job.description_markdown.slice(0, 180)}...` : job.description_markdown;
  const tags = [...job.source_systems, ...job.target_systems, ...job.protocols].slice(0, 3);

  return <article className={cn('rounded-[12px] border border-[#dde1e7] bg-white p-5 transition hover:border-[#365cf5]/45 hover:shadow-sm', className)}>
    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><Link href={`/jobs/${job.id}`} className="block truncate text-[16px] font-normal text-[#172033] hover:text-[#365cf5]">{job.title}</Link><p className="mt-1 truncate text-[11px] text-[#667085]">{company} · {formatDate(job.created_at)}</p></div><button type="button" aria-label={`Save ${job.title}`} className="text-[#98a2b3] transition hover:text-[#365cf5]"><Bookmark className="h-4 w-4" /></button></div>
    <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-[#eef1ff] px-2.5 py-1 text-[10px] text-[#2445c7]">{budget}</span><span className="rounded-full bg-[#f0f2f5] px-2.5 py-1 text-[10px] capitalize text-[#667085]">{job.status.replace('_', ' ')}</span><span className="rounded-full bg-[#e8f6f1] px-2.5 py-1 text-[10px] text-[#148267]">Remote</span></div>
    <p className="mt-4 text-[12px] leading-5 text-[#2d3748]">{description}</p>
    <div className="mt-3 flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="rounded-full bg-[#f0f2f5] px-2.5 py-1 text-[10px] text-[#667085]">{tag}</span>)}</div>
    <div className="mt-4 flex items-center justify-between text-[10px] text-[#667085]"><span>{job.proposals_count} proposals</span><span className="flex items-center gap-1 text-[#148267]"><CheckCircle2 className="h-3.5 w-3.5" /> Payment verified</span></div>
    {showActions && <Link href={`/jobs/${job.id}`} className="mt-4 inline-block text-xs font-semibold text-[#365cf5]">View details</Link>}
  </article>;
}
export { JobCard };
