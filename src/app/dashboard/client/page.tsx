'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Circle,
  MessagesSquare,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import {
  DashboardLink,
  DashboardMetric,
  DashboardPanel,
  EmptyDashboardPanel,
  MessagePreview,
} from '@/components/dashboard/dashboard-panels';
import {
  ClientJobService,
  ClientMessagingService,
  ClientProfileService,
} from '@/services/client-api.service';
import { Button } from '@/components/ui/button';

function getLocalGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type DashboardState = {
  profile: Awaited<ReturnType<typeof ClientProfileService.getProfile>> | null;
  jobs: Awaited<ReturnType<typeof ClientJobService.getJobs>>['jobs'];
  conversations: unknown[];
  loading: boolean;
  error: string | null;
};

export default function ClientDashboardPage() {
  const [state, setState] = useState<DashboardState>({
    profile: null,
    jobs: [],
    conversations: [],
    loading: true,
    error: null,
  });
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      ClientProfileService.getProfile(),
      ClientJobService.getJobs({
        page: 1,
        limit: 5,
        status: ['draft', 'open', 'in_review', 'hired'],
      }),
      ClientMessagingService.getUserConversations().catch(() => []),
    ])
      .then(([profile, jobs, conversations]) => {
        if (cancelled) return;
        setState({
          profile,
          jobs: jobs.jobs,
          conversations,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: err instanceof Error ? err.message : 'Unable to load dashboard',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <DashboardShell
        accountName="Client account"
        roleLabel="Enterprise Client"
        initials=""
        role="client"
      >
        <div className="flex min-h-[calc(100vh-72px)] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#dde1e7] border-t-[#365cf5]" />
        </div>
      </DashboardShell>
    );
  }

  const profile = state.profile;
  const name = profile?.profile.display_name || profile?.profile.first_name || 'Client';
  const companyName = profile?.company?.brand_name || profile?.company?.legal_name || name;
  const initials = companyName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hasCompanyProfile = Boolean(profile?.clientProfile && profile?.company);
  const openJobsCount = state.jobs.filter((job) => job.status === 'open').length;
  const greeting = getLocalGreeting();

  const onboardingSteps = [
    {
      label: 'Complete company profile',
      done: hasCompanyProfile,
      href: '/profile',
    },
    {
      label: 'Browse open discussions',
      done: false,
      href: '/forum',
    },
    {
      label: 'Post your first SAP role',
      done: state.jobs.length > 0,
      href: '/jobs/create',
    },
  ];

  return (
    <DashboardShell
      accountName={companyName}
      roleLabel="Enterprise Client"
      initials={initials}
      role="client"
    >
      <div className="p-5 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-[28px] font-normal text-[#172033]">
              {greeting}, {name.split(' ')[0]}
            </h1>
            <p className="mt-1 text-sm text-[#667085]">
              A clear view of your SAP integration hiring and community activity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/consultants')}>
              Browse consultants
            </Button>
            <Button onClick={() => router.push('/jobs/create')}>Post a job</Button>
          </div>
        </div>

        {state.error && state.error !== 'Resource not found.' && (
          <div className="mt-5 rounded-[10px] border border-[#f4c7c3] bg-[#fef0ef] p-4 text-sm text-[#b42318]">
            {state.error}
          </div>
        )}

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardMetric
            label="Open jobs"
            value={String(openJobsCount)}
            detail="Currently accepting proposals"
            icon={BriefcaseBusiness}
          />
          <DashboardMetric
            label="Total posted jobs"
            value={String(state.jobs.length)}
            detail="Across all statuses"
            icon={BarChart3}
          />
          <DashboardMetric
            label="Messages"
            value={String(state.conversations.length)}
            detail={
              state.conversations.length === 1 ? 'Active conversation' : 'Active conversations'
            }
            icon={MessagesSquare}
          />
          <DashboardMetric
            label="Company profile"
            value={hasCompanyProfile ? 'Ready' : 'Setup needed'}
            detail={hasCompanyProfile ? 'Visible to consultants' : 'Add company details'}
            icon={Building2}
          />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <DashboardPanel
              title="Posted jobs"
              action={<DashboardLink href="/jobs">Manage all jobs</DashboardLink>}
            >
              {state.jobs.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-left text-xs">
                    <thead className="bg-[#f0f2f5] text-[10px] uppercase text-[#667085]">
                      <tr>
                        <th className="p-3">Job</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Proposals</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.jobs.map((job) => (
                        <tr key={job.id} className="border-t border-[#dde1e7]">
                          <td className="p-3 font-medium">{job.title}</td>
                          <td className="p-3">
                            <span className="rounded-full bg-[#eef1ff] px-2 py-1 text-[10px] text-[#2445c7]">
                              {job.status}
                            </span>
                          </td>
                          <td className="p-3">{job.proposals_count}</td>
                          <td className="p-3">
                            <Link href={`/jobs/${job.id}`} className="text-[#365cf5] hover:underline">
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyDashboardPanel
                  title="No posted jobs yet"
                  detail="Post a project to start connecting with SAP integration consultants."
                  href="/jobs/create"
                  action="Post a job"
                />
              )}
            </DashboardPanel>

            <div className="grid gap-5 md:grid-cols-2">
              <DashboardPanel
                title="Community Forum"
                action={<DashboardLink href="/forum">Open forum</DashboardLink>}
              >
                <p className="text-xs leading-5 text-[#667085]">
                  Join technical discussions on SAP Cloud Integration, Integration Suite, and
                  migration architecture alongside verified practitioners.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push('/forum')}>
                    Browse discussions
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/forum/new')}>
                    Start a topic
                  </Button>
                </div>
              </DashboardPanel>

              <DashboardPanel
                title="Messages"
                action={<DashboardLink href="/messages">Open inbox</DashboardLink>}
              >
                {state.conversations.length ? (
                  <div className="space-y-4">
                    {state.conversations.slice(0, 3).map((_, index) => (
                      <MessagePreview
                        key={index}
                        name={`Conversation ${index + 1}`}
                        detail="Open conversation to view messages"
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyDashboardPanel
                    title="No conversations yet"
                    detail="Messages will appear here when you connect with SAP consultants."
                  />
                )}
              </DashboardPanel>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-[#365cf5]/20 bg-[#365cf5]/[0.04] p-5 text-[#172033]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16px] font-medium text-[#172033]">
                  {hasCompanyProfile ? 'Workspace readiness' : 'Get started'}
                </h2>
                <span className="rounded-full bg-[#eef1ff] px-2.5 py-0.5 text-xs font-semibold text-[#365cf5]">
                  {hasCompanyProfile ? 'Ready' : 'Setup'}
                </span>
              </div>

              <p className="mt-3 text-xs leading-5 text-[#667085]">
                {hasCompanyProfile
                  ? 'Your company details are visible to SAP integration specialists across the marketplace.'
                  : 'Add your company details and SAP footprint to establish trust with top integration consultants.'}
              </p>

              <ul className="mt-5 space-y-2.5">
                {onboardingSteps.map((step) => (
                  <li key={step.label}>
                    <Link
                      href={step.href}
                      className="flex items-center gap-2.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-medium text-[#172033] transition-colors hover:bg-white"
                    >
                      {step.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#365cf5]" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-[#98a2b3]" />
                      )}
                      <span className={step.done ? 'line-through text-[#667085]' : ''}>
                        {step.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <Button
                variant="outline"
                size="sm"
                className="mt-5 w-full bg-white"
                onClick={() => router.push('/profile')}
              >
                {hasCompanyProfile ? 'Manage profile' : 'Complete company profile'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
