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

interface JobFilters { search: string; sapProducts: string[]; sourceSystems: string[]; targetSystems: string[]; integrationTypes: string[]; protocols: string[]; budgetMin: string; budgetMax: string; budgetType: string; status: string[]; sortBy: string; sortOrder: string; page: number; limit: number; }
const initialFilters: JobFilters = { search: '', sapProducts: [], sourceSystems: [], targetSystems: [], integrationTypes: [], protocols: [], budgetMin: '', budgetMax: '', budgetType: '', status: [], sortBy: 'created_at', sortOrder: 'desc', page: 1, limit: 10 };
function filtersFromParams(params: URLSearchParams): JobFilters {
  // `projectType` and `experienceMin` are read only so a stale bookmarked URL
  // does not poison the filter state; neither is forwarded to the API, because
  // the columns they targeted do not exist on `jobs`.
  return { ...initialFilters, search: params.get('search') || '', budgetType: params.get('budgetType') || '', budgetMin: params.get('budgetMin') || '', budgetMax: params.get('budgetMax') || '', sortBy: params.get('sortBy') || 'created_at', sortOrder: params.get('sortOrder') || 'desc', page: Number(params.get('page')) || 1, limit: Number(params.get('limit')) || 10 };
}
/**
 * Sidebar filter groups.
 *
 * `value` is what gets written into the filters state and must be the actual
 * value sent to the API, not a human-readable label. The previous version
 * stored display strings for the numeric filters ('$5,000+', 'Expert'), which
 * `Number()` turned into NaN, and it reused `projectType` as the key for two
 * different groups so the two panels fought over the same field. Labels stay
 * for display via the `label` column.
 */
const filterGroups = [
  // `budgetType` maps to the real `budget_type` enum. The group used to be keyed
  // `projectType`, which the service filtered on a `project_type` column that
  // does not exist on `jobs` -- so selecting anything here made the whole
  // listing 500. The option values were already budget-type values.
  { title: 'Engagement type', key: 'budgetType', options: [{ label: 'Hourly', value: 'hourly_rate' }, { label: 'Fixed price', value: 'fixed_price' }, { label: 'Budget range', value: 'range' }] },
  { title: 'Minimum budget', key: 'budgetMin', options: [{ label: '$5,000+', value: '500000' }, { label: '$1,000–$4,999', value: '100000' }, { label: '$500–$999', value: '50000' }] },
] as const;

/**
 * Translate the filter state into the query the jobs API expects.
 *
 * Module-level and pure so both the effect and the retry handler can use it
 * without the effect having to depend on an in-component function.
 *
 * The numeric budget filters arrive as strings from the sidebar options (the
 * API takes cents) and are converted here. An empty string means "no bound",
 * so it is sent as `undefined` rather than `0` -- `0` would mean "budget must
 * be exactly zero".
 */
function buildJobsQuery(filters: JobFilters): Record<string, unknown> {
  return {
    ...filters,
    budgetMin: filters.budgetMin ? Number(filters.budgetMin) : undefined,
    budgetMax: filters.budgetMax ? Number(filters.budgetMax) : undefined,
    budgetType: filters.budgetType || undefined,
    search: filters.search || undefined,
    sapProducts: filters.sapProducts.length ? filters.sapProducts : undefined,
    sourceSystems: filters.sourceSystems.length ? filters.sourceSystems : undefined,
    targetSystems: filters.targetSystems.length ? filters.targetSystems : undefined,
    integrationTypes: filters.integrationTypes.length ? filters.integrationTypes : undefined,
    protocols: filters.protocols.length ? filters.protocols : undefined,
    status: filters.status.length ? filters.status : undefined,
  };
}

export default function JobsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobFilters>(() => filtersFromParams(searchParams));
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 0 });

  // Refetch whenever the filters change.
  //
  // The request is issued here directly rather than through a `loadJobs` helper
  // declared in the component body. Referencing such a helper from the effect is
  // what produced the exhaustive-deps warning, and "fixing" it by adding the
  // helper to the dependency array would re-run the effect on every render,
  // because the helper is re-created each time. The shared logic lives in
  // `buildJobsQuery` above, which is module-level and therefore stable.
  //
  // The cancellation flag is checked BEFORE every state write, so a slow
  // response for a previous filter set cannot land after the user has typed a
  // new filter.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await JobService.getJobs(buildJobsQuery(filters));
        if (cancelled) return;
        setJobs(result.jobs); setPagination({ total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) });
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filters]);

  /** Retry path. Re-runs the same request against the current filters. */
  async function loadJobs() {
    try {
      setLoading(true); setError(null);
      const result = await JobService.getJobs(buildJobsQuery(filters));
      setJobs(result.jobs); setPagination({ total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to load jobs'); } finally { setLoading(false); }
  }

  function updateFilter(name: keyof JobFilters, value: string) { setFilters((current) => ({ ...current, [name]: value, page: name === 'page' ? Number(value) : 1 })); }
  function clearFilters() { setFilters(initialFilters); }

  // Describes the filters actually in effect, so the alert copy cannot claim a
  // search the user never made.
  const activeFilterSummary = (() => {
    const parts: string[] = [];
    if (filters.search) parts.push(`“${filters.search}”`);
    for (const { key, options } of filterGroups) {
      const match = options.find((option) => option.value === filters[key]);
      if (match) parts.push(match.label);
    }
    return parts.length ? parts.join(' · ') : 'all open projects';
  })();

  if (loading) return <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#f5f6f8]"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#dde1e7] border-t-[#365cf5]" /><p className="mt-4 text-sm text-[#667085]">Loading jobs...</p></div></main>;
  if (error) return <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#f5f6f8] p-6"><Card className="max-w-md p-6 text-center"><p className="text-sm text-[#b42318]">{error}</p><Button className="mt-4" onClick={() => router.refresh()}>Try again</Button></Card></main>;

  return <main className="bg-[#f5f6f8]">
    <section className="border-b border-[#dde1e7] bg-white"><div className="mx-auto max-w-[1280px] px-6 py-10 sm:px-10"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Marketplace</p><h1 className="mt-2 text-[32px] font-normal">Find work with real momentum</h1><p className="mt-2 text-sm text-[#667085]">{pagination.total.toLocaleString()} open projects from serious clients around the world.</p></div><Button variant="outline" size="sm">Saved jobs</Button></div><div className="mt-6 flex h-[58px] items-center gap-3 rounded-[10px] border border-[#dde1e7] bg-white p-2 shadow-sm"><Search className="ml-2 h-5 w-5 text-[#667085]" /><input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search jobs by title, skill, or company" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98a2b3]" /><Button size="sm" onClick={() => void loadJobs()}>Search jobs</Button></div>{/* Integration-type chips. These are real `integration_type` enum values; the
    previous list (Design, Marketing, Writing...) was placeholder copy unrelated
    to the SAP/CPI domain and offered no filtering. */}
<div className="mt-4 flex gap-2 overflow-x-auto pb-1"><Badge variant="sap">All jobs</Badge>{(['p2p', 'a2a', 'b2b', 'batch', 'realtime', 'event_driven', 'hybrid'] as const).map((tag) => <Badge key={tag} variant="default" className="shrink-0">{tag.replace('_', ' ')}</Badge>)}</div></div></section>
    <section className="mx-auto grid max-w-[1280px] gap-8 px-6 py-9 sm:px-10 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block"><Card className="p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Filters</h2><button onClick={clearFilters} className="text-[11px] text-[#365cf5]">Clear all</button></div><div className="mt-4 space-y-0">{filterGroups.map(({ title, key, options }) => <div key={title} className="border-t border-[#dde1e7] py-4"><div className="mb-3 flex items-center justify-between text-xs font-semibold">{title}<ChevronDown className="h-3.5 w-3.5 text-[#667085]" /></div>{options.map((option) => {
        // Each group drives a single scalar field, so the checkbox reflects the
        // stored value directly and selecting a new option replaces the old
        // one. The previous `index === 0` condition made every option except the
        // first render permanently unchecked and unclickable.
        const selected = filters[key] === option.value;
        return <label key={option.value} className="flex items-center gap-2 py-1.5 text-[11px] text-[#667085]"><input type="checkbox" checked={selected} onChange={() => updateFilter(key as keyof JobFilters, selected ? '' : option.value)} className="h-3.5 w-3.5 rounded border-[#c7ced9] accent-[#365cf5]" /><span>{option.label}</span></label>;
      })}</div>)}</div></Card></aside>
      <div className="min-w-0"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="text-lg font-semibold">{pagination.total.toLocaleString()} matching jobs</h2><p className="text-[11px] text-[#667085]">{filters.search ? `Results for “${filters.search}”` : 'Showing all currently open projects'}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" className="lg:hidden"><SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> Filters</Button><label className="flex h-10 items-center gap-2 rounded-[10px] border border-[#dde1e7] bg-white px-3 text-xs text-[#667085]"><span>Most relevant</span><ChevronDown className="h-3.5 w-3.5" /><select value={filters.sortBy} onChange={(event) => updateFilter('sortBy', event.target.value)} className="absolute h-0 w-0 opacity-0"><option value="created_at">Most relevant</option><option value="updated_at">Recently updated</option><option value="views_count">Most viewed</option></select></label></div></div><div className="mt-5 flex items-center justify-between rounded-[10px] bg-[#eef1ff] px-4 py-3 text-xs text-[#2445c7]"><span className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Get alerts for {activeFilterSummary}</span><button className="text-[11px] font-semibold">Save search</button></div><div className="mt-3 space-y-3">{jobs.length ? jobs.map((job) => <JobCard key={job.id} job={job as unknown as JobCardJob} showActions={false} />) : <Card className="p-10 text-center"><p className="text-sm text-[#667085]">No jobs found matching your criteria.</p><button onClick={clearFilters} className="mt-3 text-sm font-semibold text-[#365cf5]">Show all jobs</button></Card>}</div>{pagination.totalPages > 1 && <div className="mt-6 flex items-center justify-center gap-2"><Button size="sm" variant="outline" disabled={pagination.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</Button><span className="flex h-8 min-w-8 items-center justify-center rounded-[8px] bg-[#365cf5] px-2 text-xs text-white">{pagination.page}</span><Button size="sm" variant="outline" disabled={pagination.page === pagination.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</Button></div>}</div>
    </section>
  </main>;
}
