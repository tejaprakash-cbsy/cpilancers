'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  MessagesSquare,
  MessageSquareText,
  Send,
  User,
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
  ClientMessagingService,
  ClientProfileService,
  ClientProposalService,
} from '@/services/client-api.service';
import { Button } from '@/components/ui/button';

function getLocalGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type State = {
  profile: Awaited<ReturnType<typeof ClientProfileService.getProfile>> | null;
  proposals: Awaited<ReturnType<typeof ClientProposalService.getProposalsByConsultant>>['proposals'];
  conversations: unknown[];
  loading: boolean;
  error: string | null;
};

export default function ConsultantDashboardPage() {
  const [state, setState] = useState<State>({
    profile: null,
    proposals: [],
    conversations: [],
    loading: true,
    error: null,
  });
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    ClientProfileService.getProfile()
      .then(async (profile) => {
        const [proposalData, conversations] = await Promise.all([
          profile?.consultantProfile
            ? ClientProposalService.getProposalsByConsultant({ page: 1, limit: 5 })
            : Promise.resolve({ proposals: [], total: 0, page: 1, limit: 5 }),
          ClientMessagingService.getUserConversations().catch(() => []),
        ]);
        if (cancelled) return;
        setState({
          profile,
          proposals: proposalData.proposals,
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
        accountName="Consultant account"
        roleLabel="SAP Consultant"
        initials=""
        role="consultant"
      >
        <div className="flex min-h-[calc(100vh-72px)] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#dde1e7] border-t-[#365cf5]" />
        </div>
      </DashboardShell>
    );
  }

  const profile = state.profile;
  const name = profile?.profile.display_name || profile?.profile.first_name || 'Consultant';
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const profileScore = profile?.consultantProfile?.profile_score || 0;
  const hasConsultantProfile = Boolean(profile?.consultantProfile);
  const greeting = getLocalGreeting();

  const onboardingSteps = [
    {
      label: 'Complete SAP profile',
      done: hasConsultantProfile && profileScore >= 50,
      href: '/profile',
    },
    {
      label: 'Browse open discussions',
      done: false,
      href: '/forum',
    },
    {
      label: 'Explore jobs',
      done: state.proposals.length > 0,
      href: '/jobs',
    },
  ];

  return (
    <DashboardShell
      accountName={name}
      roleLabel="SAP Consultant"
      initials={initials}
      role="consultant"
    >
      <div className="p-5 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-[28px] font-normal text-[#172033]">
              {greeting}, {name.split(' ')[0]}
            </h1>
            <p className="mt-1 text-sm text-[#667085]">
              Here&apos;s what&apos;s moving across your SAP practice this week.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/forum')}>
              Community Forum
            </Button>
            <Button onClick={() => router.push('/jobs')}>Find new work</Button>
          </div>
        </div>

        {state.error && state.error !== 'Resource not found.' && (
          <div className="mt-5 rounded-[10px] border border-[#f4c7c3] bg-[#fef0ef] p-4 text-sm text-[#b42318]">
            {state.error}
          </div>
        )}

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardMetric
            label="Open proposals"
            value={String(state.proposals.length)}
            detail={state.proposals.length === 1 ? 'Active submission' : 'Active submissions'}
            icon={Send}
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
            label="Profile readiness"
            value={`${profileScore}%`}
            detail={profileScore >= 80 ? 'Ready for matching' : 'Complete your SAP profile'}
            icon={User}
          />
          <DashboardMetric
            label="Community Forum"
            value="Open"
            detail="SAP CPI & Integration Suite"
            icon={MessageSquareText}
          />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <DashboardPanel
              title="Proposal pipeline"
              action={<DashboardLink href="/proposals">Manage proposals</DashboardLink>}
            >
              <div className="grid gap-3 sm:grid-cols-4">
                {['draft', 'submitted', 'shortlisted', 'accepted'].map((status) => (
                  <div key={status} className="rounded-[8px] bg-[#f0f2f5] p-4">
                    <strong className="block text-xl font-normal">
                      {state.proposals.filter((proposal) => proposal.status === status).length}
                    </strong>
                    <span className="mt-1 block text-[10px] capitalize text-[#667085]">
                      {status}
                    </span>
                  </div>
                ))}
              </div>
              {state.proposals.length === 0 && (
                <p className="mt-4 text-xs text-[#667085]">
                  No active proposals yet —{' '}
                  <Link href="/jobs" className="font-medium text-[#365cf5] hover:underline">
                    browse open SAP roles
                  </Link>{' '}
                  to submit your first proposal.
                </p>
              )}
            </DashboardPanel>

            <div className="grid gap-5 md:grid-cols-2">
              <DashboardPanel
                title="Community Forum"
                action={<DashboardLink href="/forum">Open forum</DashboardLink>}
              >
                <p className="text-xs leading-5 text-[#667085]">
                  Connect with SAP CPI, PI/PO, and Integration Suite architects. Share integration
                  patterns, troubleshoot iFlows, and build your reputation.
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
                    detail="Messages will appear here when clients contact you."
                  />
                )}
              </DashboardPanel>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-[#365cf5]/20 bg-[#365cf5]/[0.04] p-5 text-[#172033]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16px] font-medium text-[#172033]">
                  {hasConsultantProfile ? 'Profile readiness' : 'Get started'}
                </h2>
                <span className="rounded-full bg-[#eef1ff] px-2.5 py-0.5 text-xs font-semibold text-[#365cf5]">
                  {profileScore}%
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-[#365cf5] bg-white text-xs font-semibold text-[#365cf5]">
                  {profileScore}%
                </div>
                <p className="text-xs leading-5 text-[#667085]">
                  {hasConsultantProfile
                    ? 'Keep your SAP skills, hourly rate, and portfolio current to stand out to enterprise clients.'
                    : 'Add your SAP specialization, CPI experience, and overview to unlock client matching.'}
                </p>
              </div>

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
                {hasConsultantProfile ? 'Update profile' : 'Complete profile'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
