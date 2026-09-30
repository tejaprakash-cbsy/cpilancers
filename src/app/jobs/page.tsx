'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { BellRing, ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { ClientJobService as JobService } from '@/services/client-api.service';
import { JobCard, type JobCardJob } from '@/components/jobs/job-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { Job } from '@/types/database';

interface JobFilters { search: string; sapProducts: string[]; sourceSystems: string[]; targetSystems: string[]; integrationTypes: string[]; protocols: string[]; budgetMin: string; budgetMax: string; experienceMin: string; projectType: string; status: string[]; sortBy: string; sortOrder: string; page: number; limit: number; }
const initialFilters: JobFilters = { search: '', sapProducts: [], sourceSystems: [], targetSystems: [], integrationTypes: [], protocols: [], budgetMin: '', budgetMax: '', experienceMin: '', projectType: '', status: [], sortBy: 'created_at', sortOrder: 'desc', page: 1, limit: 10 };
function filtersFromParams(params: URLSearchParams): JobFilters {
  return { ...initialFilters, search: params.get('search') || '', projectType: params.get('projectType') || '', budgetMin: params.get('budgetMin') || '', budgetMax: params.get('budgetMax') || '', experienceMin: params.get('experienceMin') || '', sortBy: params.get('sortBy') || 'created_at', sortOrder: params.get('sortOrder') || 'desc', page: Number(params.get('page')) || 1, limit: Number(params.get('limit')) || 10 };
}
const filterGroups = [
  ['Project type', 'projectType', ['Hourly', 'Fixed price']],
  ['Experience level', 'experienceMin', ['Expert', 'Advanced', 'Intermediate']],
  ['Budget', 'budgetMin', ['$5,000+', '$1,000–$4,999', '$500–$999', 'Under $500']],
  ['Client history', 'status', ['Payment verified', '10+ hires', '1–9 hires', 'New client']],
  ['Project duration', 'projectType', ['6+ months', '3–6 months', '1–3 months', 'Less than 1 month']],
] as const;

export default function JobsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobFilters>(() => filtersFromParams(searchParams));
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 0 });

  useEffect(() => { void loadJobs(); }, [filters]);

  async function loadJobs() {
    try {
      setLoading(true); setError(null);
      const result = await JobService.getJobs({ ...filters, budgetMin: filters.budgetMin ? Number(filters.budgetMin) : undefined, budgetMax: filters.budgetMax ? Number(filters.budgetMax) : undefined, experienceMin: filters.experienceMin ? Number(filters.experienceMin) : undefined, search: filters.search || undefined, projectType: filters.projectType || undefined, sapProducts: filters.sapProducts.length ? filters.sapProducts : undefined, sourceSystems: filters.sourceSystems.length ? filters.sourceSystems : undefined, targetSystems: filters.targetSystems.length ? filters.targetSystems : undefined, integrationTypes: filters.integrationTypes.length ? filters.integrationTypes : undefined, protocols: filters.protocols.length ? filters.protocols : undefined, status: filters.status.length ? filters.status : undefined });
      setJobs(result.jobs); setPagination({ total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to load jobs'); } finally { setLoading(false); }
  }

  function updateFilter(name: keyof JobFilters, value: string) { setFilters((current) => ({ ...current, [name]: value, page: name === 'page' ? Number(value) : 1 })); }
  function clearFilters() { setFilters(initialFilters); }

  if (loading) return <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#f5f6f8]"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#dde1e7] border-t-[#365cf5]" /><p className="mt-4 text-sm text-[#667085]">Loading jobs...</p></div></main>;
  if (error) return <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#f5f6f8] p-6"><Card className="max-w-md p-6 text-center"><p className="text-sm text-[#b42318]">{error}</p><Button className="mt-4" onClick={() => router.refresh()}>Try again</Button></Card></main>;

  return <main className="bg-[#f5f6f8]">
    <section className="border-b border-[#dde1e7] bg-white"><div className="mx-auto max-w-[1280px] px-6 py-10 sm:px-10"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Marketplace</p><h1 className="mt-2 text-[32px] font-normal">Find work with real momentum</h1><p className="mt-2 text-sm text-[#667085]">{pagination.total.toLocaleString()} open projects from serious clients around the world.</p></div><Button variant="outline" size="sm">Saved jobs · 12</Button></div><div className="mt-6 flex h-[58px] items-center gap-3 rounded-[10px] border border-[#dde1e7] bg-white p-2 shadow-sm"><Search className="ml-2 h-5 w-5 text-[#667085]" /><input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search jobs by title, skill, or company" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98a2b3]" /><Button size="sm" onClick={() => void loadJobs()}>Search jobs</Button></div><div className="mt-4 flex gap-2 overflow-x-auto pb-1"><Badge variant="sap">All jobs</Badge>{['Design', 'Development', 'Data & AI', 'Marketing', 'Writing', 'Consulting', 'Operations'].map((tag) => <Badge key={tag} variant="default" className="shrink-0">{tag}</Badge>)}</div></div></section>
    <section className="mx-auto grid max-w-[1280px] gap-8 px-6 py-9 sm:px-10 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block"><Card className="p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Filters</h2><button onClick={clearFilters} className="text-[11px] text-[#365cf5]">Clear all</button></div><div className="mt-4 space-y-0">{filterGroups.map(([title, key, options]) => <div key={title} className="border-t border-[#dde1e7] py-4"><div className="mb-3 flex items-center justify-between text-xs font-semibold">{title}<ChevronDown className="h-3.5 w-3.5 text-[#667085]" /></div>{options.map((option, index) => <label key={option} className="flex items-center gap-2 py-1.5 text-[11px] text-[#667085]"><input type="checkbox" checked={index === 0 && (key === 'projectType' ? Boolean(filters.projectType) : true)} onChange={() => updateFilter(key as keyof JobFilters, index === 0 ? option : '')} className="h-3.5 w-3.5 rounded border-[#c7ced9] accent-[#365cf5]" /><span>{option}</span></label>)}</div>)}</div></Card></aside>
      <div className="min-w-0"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="text-lg font-semibold">{pagination.total.toLocaleString()} matching jobs</h2><p className="text-[11px] text-[#667085]">{filters.search ? 'Results for your search' : '128 new since your last visit'}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" className="lg:hidden"><SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> Filters</Button><label className="flex h-10 items-center gap-2 rounded-[10px] border border-[#dde1e7] bg-white px-3 text-xs text-[#667085]"><span>Most relevant</span><ChevronDown className="h-3.5 w-3.5" /><select value={filters.sortBy} onChange={(event) => updateFilter('sortBy', event.target.value)} className="absolute h-0 w-0 opacity-0"><option value="created_at">Most relevant</option><option value="updated_at">Recently updated</option><option value="views_count">Most viewed</option></select></label></div></div><div className="mt-5 flex items-center justify-between rounded-[10px] bg-[#eef1ff] px-4 py-3 text-xs text-[#2445c7]"><span className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Get alerts for “Product design · Expert · $5k+”</span><button className="text-[11px] font-semibold">Save search</button></div><div className="mt-3 space-y-3">{jobs.length ? jobs.map((job) => <JobCard key={job.id} job={job as unknown as JobCardJob} showActions={false} />) : <Card className="p-10 text-center"><p className="text-sm text-[#667085]">No jobs found matching your criteria.</p><button onClick={clearFilters} className="mt-3 text-sm font-semibold text-[#365cf5]">Show all jobs</button></Card>}</div>{pagination.totalPages > 1 && <div className="mt-6 flex items-center justify-center gap-2"><Button size="sm" variant="outline" disabled={pagination.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</Button><span className="flex h-8 min-w-8 items-center justify-center rounded-[8px] bg-[#365cf5] px-2 text-xs text-white">{pagination.page}</span><Button size="sm" variant="outline" disabled={pagination.page === pagination.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</Button></div>}</div>
    </section>
  </main>;
}
