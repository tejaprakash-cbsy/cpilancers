'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Bookmark, Check, CheckCircle2, Clock3, DollarSign, MapPin, ShieldCheck } from 'lucide-react';
import { ClientJobService as JobService, ClientAuthService as AuthService } from '@/services/client-api.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Job } from '@/types/database';

type JobDetail = Job & { project_type?: string | null; experience_required?: number | null; authentication_requirements?: string | null; data_transformation_requirements?: string | null; error_handling_requirements?: string | null; monitoring_requirements?: string | null; testing_requirements?: string | null; project_deadline?: string | null; company?: { legal_name: string; brand_name: string | null } | null };

export default function JobDetailPage() {
  const { id } = useParams(); const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [isOwner, setIsOwner] = useState(false); const [isConsultant, setIsConsultant] = useState(false);
  /**
   * Load the job and work out what the viewer is allowed to do with it.
   *
   * `shouldApply` is the cancelled-flag guard, checked BEFORE every state write.
   * Without it, navigating from job A to job B while A's request is still in
   * flight lets A's response land last and render A under B's URL.
   */
  const loadJobData = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      try {
        setLoading(true);
        setError(null);
        const data = await JobService.getJobById(id as string);
        if (!shouldApply()) return;
        if (!data) {
          setError('Job not found');
          return;
        }
        setJob(data);
        const user = await AuthService.getCurrentUser();
        if (!shouldApply()) return;
        if (user) {
          setIsConsultant(user.role === 'consultant');
          if (user.role === 'client') {
            const clientId = await JobService.getClientIdByUserId(user.id);
            if (!shouldApply()) return;
            setIsOwner(data.client_id === clientId);
          }
        }
      } catch (err: unknown) {
        if (!shouldApply()) return;
        setError(err instanceof Error ? err.message : 'Failed to load job');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    let cancelled = false;
    const shouldApply = () => !cancelled;
    void (async () => {
      await loadJobData(shouldApply);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadJobData]);
  async function mutate(action: () => Promise<unknown>) { try { await action(); router.refresh(); } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Unable to update job'); } }
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8]"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#dde1e7] border-t-[#365cf5]" /><p className="mt-4 text-sm text-[#667085]">Loading job details...</p></div></main>;
  if (error || !job) return <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] p-6"><Card className="max-w-md p-6 text-center"><h1 className="text-lg font-semibold">{error || 'Job not found'}</h1><p className="mt-2 text-sm text-[#667085]">The job you are looking for may no longer be available.</p><Button className="mt-5" onClick={() => router.push('/jobs')}>Go to job listings</Button></Card></main>;
  const budget = job.budget_type === 'fixed_price' && job.budget_fixed_cents !== null ? formatCurrency(job.budget_fixed_cents) : job.budget_type === 'range' && job.budget_min_cents !== null && job.budget_max_cents !== null ? `${formatCurrency(job.budget_min_cents)}–${formatCurrency(job.budget_max_cents)}` : 'Hourly rate';
  const bullets = job.deliverables_markdown.split(/[\n•-]+/).map((item) => item.trim()).filter(Boolean);
  const requirements = [job.authentication_requirements, job.data_transformation_requirements, job.error_handling_requirements, job.monitoring_requirements].filter(Boolean) as string[];
  return <main className="bg-[#f5f6f8]"><div className="mx-auto max-w-[1280px] px-6 py-8 sm:px-10"><div className="mb-5 text-[11px] text-[#667085]">Jobs <span className="mx-2">/</span> {job.title}</div><div className="grid gap-5 lg:grid-cols-[1fr_340px]"><div className="space-y-4"><Card className="p-7"><div className="flex items-start justify-between gap-4"><div><Badge variant="sap">{job.status.replace('_', ' ')}</Badge><h1 className="mt-4 text-[28px] font-normal leading-tight">{job.title}</h1><p className="mt-3 text-[11px] text-[#667085]">Posted {formatDate(job.created_at)}</p></div><button aria-label="Save job" className="text-[#98a2b3] hover:text-[#365cf5]"><Bookmark className="h-5 w-5" /></button></div><div className="mt-7 grid grid-cols-2 gap-5 border-t border-[#dde1e7] pt-5 sm:grid-cols-4"><Detail icon={DollarSign} value={budget} label="Fixed-price budget" /><Detail icon={Clock3} value={`${job.estimated_duration_weeks} ${job.estimated_duration_weeks === 1 ? 'week' : 'weeks'}`} label="Project duration" /><Detail icon={ShieldCheck} value={job.experience_required != null ? `${job.experience_required}+ years` : 'Not specified'} label="Experience level" /></div></Card><Card className="p-7"><h2 className="text-lg font-medium">About the project</h2><p className="mt-5 whitespace-pre-line text-sm leading-6 text-[#667085]">{job.description_markdown}</p>{bullets.length > 0 && <><h3 className="mt-7 text-sm font-semibold">What you&apos;ll do</h3><ul className="mt-4 space-y-3 text-xs text-[#2d3748]">{bullets.map((item) => <li key={item} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#148267]" />{item}</li>)}</ul></>}<h3 className="mt-7 text-sm font-semibold">What we&apos;re looking for</h3><ul className="mt-4 space-y-3 text-xs text-[#2d3748]">{requirements.length ? requirements.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-[#365cf5]" />{item}</li>) : <li className="text-[#667085]">Strong communication and relevant project experience.</li>}</ul></Card><Card className="p-7"><h2 className="text-lg font-medium">Skills and expertise</h2><div className="mt-5 flex flex-wrap gap-2">{[...job.source_systems, ...job.target_systems, ...job.protocols].map((tag) => <Badge key={tag} variant="default">{tag}</Badge>)}</div></Card><Card className="p-7"><h2 className="text-lg font-medium">Job activity</h2><div className="mt-5 grid grid-cols-2 gap-5 text-xs sm:grid-cols-4"><div><strong className="block text-lg font-normal">{job.proposals_count}</strong><span className="text-[#667085]">Proposals</span></div><div><strong className="block text-lg font-normal">4</strong><span className="text-[#667085]">Interviewing</span></div><div><strong className="block text-lg font-normal">6</strong><span className="text-[#667085]">Invitations sent</span></div><div><strong className="block text-lg font-normal">2</strong><span className="text-[#667085]">Unanswered invites</span></div></div></Card></div><aside className="space-y-4"><Card className="p-6"><h2 className="text-sm font-semibold">Interested in this project?</h2><p className="mt-3 text-xs leading-5 text-[#667085]">Your profile is a strong match for this project.</p>{isConsultant && !isOwner && <Button className="mt-5 w-full" onClick={() => router.push(`/consultant/proposals/new/${id}`)}>Submit a proposal</Button>}{isOwner && <div className="mt-5 space-y-2"><Button className="w-full" onClick={() => router.push(`/jobs/${id}/proposals`)}>View proposals</Button><Button className="w-full" onClick={() => mutate(() => JobService.publishJob(id as string))}>Publish job</Button><Button variant="danger" className="w-full" onClick={() => mutate(() => JobService.closeJob(id as string))}>Close job</Button></div>}<Button variant="outline" className="mt-2 w-full"><Bookmark className="mr-2 h-4 w-4" /> Save job</Button><p className="mt-4 text-[10px] text-[#98a2b3]">Proposal uses 12 application credits · 68 available</p></Card><Card className="p-6"><h2 className="text-sm font-semibold">About the client</h2><div className="mt-5 flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef1ff] text-xs font-bold text-[#365cf5]">NC</div><div><p className="text-xs font-semibold">{job.company?.brand_name || job.company?.legal_name || 'Verified client'}</p><p className="text-[11px] text-[#667085]">4.8 ★ · 34 reviews</p></div></div><div className="mt-5 space-y-3 text-xs text-[#667085]"><p className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-[#148267]" /> Payment verified</p><p className="flex gap-2"><MapPin className="h-3.5 w-3.5" /> Remote worldwide</p><p>Member since 2022</p></div></Card><div className="rounded-[12px] bg-[#eef1ff] p-5 text-xs text-[#2445c7]"><ShieldCheck className="h-4 w-4" /><p className="mt-2">Only begin work after a funded milestone or active hourly contract is visible in Lancers.</p></div></aside></div></div></main>;
}

function Detail({ icon: Icon, value, label }: { icon: typeof DollarSign; value: string; label: string }) { return <div className="flex gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#eef1ff] text-[#365cf5]"><Icon className="h-4 w-4" /></span><span><strong className="block text-xs font-semibold">{value}</strong><small className="text-[10px] text-[#667085]">{label}</small></span></div>; }
