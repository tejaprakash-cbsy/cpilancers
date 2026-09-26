'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClientAuthService as AuthService, ClientJobService as JobService, ClientProposalService as ProposalService } from '@/services/client-api.service';
import ProposalList from '@/components/proposals/proposal-list';
import ProposalFilters from '@/components/proposals/proposal-filters';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import type { Job } from '@/types/database';
import type { ProposalListItem } from '@/components/proposals/proposal-list';

interface JobProposalsFilters {
  status: ProposalListItem['status'][];
  sortBy: string;
  sortOrder: string;
  page: number;
  limit: number;
}

export default function JobProposalsPage() {
  const { jobId } = useParams();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setUserProfile] = useState<unknown>(null);
  const [filters, setFilters] = useState<JobProposalsFilters>({
    status: [],
    sortBy: 'submitted_at',
    sortOrder: 'desc',
    page: 1,
    limit: 10,
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
  const [isClient, setIsClient] = useState(false);

  // Initialize filters from URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const params = Object.fromEntries(url.searchParams);
    const initFilters = {
      status: params.status ? params.status.split(',') : [],
      sortBy: params.sortBy || 'submitted_at',
      sortOrder: params.sortOrder || 'desc',
      page: parseInt(params.page) || 1,
      limit: parseInt(params.limit) || 10,
    };
    setFilters(initFilters as JobProposalsFilters);
    loadData();
  }, [jobId]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      // Load job details and verify ownership
      const jobData = await JobService.getJobById(jobId as string);
      if (!jobData) {
        setError('Job not found');
        return;
      }

      // Load current user profile
      const profileData = await AuthService.getCurrentUser();
      if (profileData) {
        setUserProfile(profileData);
        setIsClient(profileData.role === 'client');
      }

      // Verify the user owns this job
      if (isClient) {
        const clientId = await JobService.getClientIdByUserId(profileData.id);
        if (jobData.client_id !== clientId) {
          setError('You do not have permission to view proposals for this job.');
          return;
        }
      }

      setJob(jobData);

      // Load proposals for this job
      const result = await ProposalService.getProposalsForJob(
        jobId as string,
        profileData.id,
        filters.status.length > 0 ? filters.status : undefined,
        {
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
          page: filters.page,
          limit: filters.limit,
        }
      );

      setProposals(result.proposals as unknown as ProposalListItem[]);
      setPagination({
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load job proposals');
    } finally {
      setLoading(false);
    }
  }

  const handleFiltersChange = (newFilters: Partial<JobProposalsFilters>) => {
    setFilters({ ...filters, ...newFilters, page: 1 }); // Reset to page 1
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const handleShortlist = async (proposalId: string) => {
    try {
      await ProposalService.shortlistProposal(
        proposalId,
        (await AuthService.getCurrentUser())?.id as string
      );
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to shortlist proposal');
    }
  };

  const handleReject = async (proposalId: string) => {
    try {
      await ProposalService.rejectProposal(
        proposalId,
        (await AuthService.getCurrentUser())?.id as string
      );
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  };

  const handleAccept = async (proposalId: string) => {
    try {
      await ProposalService.acceptProposal(
        proposalId,
        (await AuthService.getCurrentUser())?.id as string
      );
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept proposal');
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="ml-4 text-lg">Loading job proposals...</p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6">
              <h3 className="text-lg font-medium mb-4">{error}</h3>
              <p className="text-gray-600">
                Please try again or contact support if the issue persists.
              </p>
              <div className="mt-4">
                <Button onClick={() => loadData()}>Try Again</Button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!job) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Job not found</h3>
              <p className="text-gray-600">
                We couldn&rsquo;t find the job you&rsquo;re looking for.
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // Redirect if not the client
  if (!isClient) {
    router.push('/');
    return null;
  }

  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-14rem)] py-8">
        <div className="max-w-4xl mx-auto">
          {/* Job Header */}
          <div className="mb-6">
            <div className="border-b pb-4">
              <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
              <div className="flex flex-wrap gap-2 mt-2 text-sm">
                <span>Posted: {formatDate(job.created_at)}</span>
                <span className={cn(
                  'px-2 py-1 text-xs font-medium rounded-full',
                  job.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                )}>
                  {job.status}
                </span>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Proposals</p>
                <p className="text-xl font-bold text-gray-900">{proposals.length}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Submitted</p>
                <p className="text-xl font-bold text-blue-600">
                  {proposals.filter(p => p.status === 'submitted').length}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Shortlisted</p>
                <p className="text-xl font-bold text-purple-600">
                  {proposals.filter(p => p.status === 'shortlisted').length}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Accepted</p>
                <p className="text-xl font-bold text-green-600">
                  {proposals.filter(p => p.status === 'accepted').length}
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <ProposalFilters value={filters} onChange={handleFiltersChange} />

          {/* Proposals List */}
          <ProposalList
            proposals={proposals}
            currentUserRole="client"
            onShortlist={handleShortlist}
            onReject={handleReject}
            onAccept={handleAccept}
          />

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-sm">
              <p className="text-gray-500">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex space-x-2">
                <Button
                  onClick={() => {
                    if (pagination.page > 1) handlePageChange(pagination.page - 1);
                  }}
                  disabled={pagination.page === 1}
                >
                  Previous
                </Button>
                <Button
                  onClick={() => {
                    if (pagination.page < pagination.totalPages) handlePageChange(pagination.page + 1);
                  }}
                  disabled={pagination.page === pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
