'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClientAuthService as AuthService, ClientProposalService as ProposalService } from '@/services/client-api.service';
import ProposalList, { type ProposalListItem } from '@/components/proposals/proposal-list';
import ProposalFilters from '@/components/proposals/proposal-filters';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ProposalListFilters {
  status: ProposalListItem['status'][];
  sortBy: string;
  sortOrder: string;
  page: number;
  limit: number;
}

export default function ConsultantProposalsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProposalListFilters>({
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

  // Initialize filters from URL
  useEffect(() => {
    const params = Object.fromEntries(searchParams);
    const initFilters = {
      status: params.status ? params.status.split(',') : [],
      sortBy: params.sortBy || 'submitted_at',
      sortOrder: params.sortOrder || 'desc',
      page: parseInt(params.page) || 1,
      limit: parseInt(params.limit) || 10,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(initFilters as ProposalListFilters);
  }, [searchParams]);

  /**
   * Load the consultant's proposals.
   *
   * `shouldApply` is the cancelled-flag guard, checked BEFORE every state write.
   * It used to be called directly from the filter-initialisation effect, which
   * meant it read the DEFAULT filters on the very first run (the `setFilters`
   * above had not been applied yet) and there was no guard at all against a slow
   * response landing after the URL changed.
   */
  const loadProposals = useCallback(
    async (shouldApply: () => boolean = () => true) => {
    try {
      setLoading(true);
      setError(null);
      const user = await AuthService.getCurrentUser();
      if (!shouldApply()) return;
      if (!user) {
        router.push('/login');
        return;
      }

      const result = await ProposalService.getProposalsByConsultant({
        status: filters.status.length > 0 ? filters.status : undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page: filters.page,
        limit: filters.limit,
      });
      if (!shouldApply()) return;

      setProposals(result.proposals as unknown as ProposalListItem[]);
      setPagination({
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      });
    } catch (err: unknown) {
      if (!shouldApply()) return;
      setError(err instanceof Error ? err.message : 'Failed to load proposals');
    } finally {
      if (shouldApply()) setLoading(false);
    }
    },
    [filters, router]
  );

  // Refetch whenever the filters themselves change, not just the URL. The
  // previous effect keyed on `searchParams` only, so changing a status filter
  // updated the state but never re-queried.
  useEffect(() => {
    let cancelled = false;
    const shouldApply = () => !cancelled;
    void (async () => {
      await loadProposals(shouldApply);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProposals]);

  const handleFiltersChange = (newFilters: Partial<ProposalListFilters>) => {
    setFilters({ ...filters, ...newFilters, page: 1 }); // Reset to page 1
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const handleWithdraw = async (proposalId: string) => {
    if (!window.confirm('Are you sure you want to withdraw this proposal?')) {
      return;
    }
    try {
      await ProposalService.withdrawProposal(proposalId);
      await loadProposals();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw proposal');
    }
  };

  if (loading) {
    return (
      <>
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="ml-4 text-lg">Loading proposals...</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6">
              <h3 className="text-lg font-medium mb-4">{error}</h3>
              <p className="text-gray-600">
                Please try again or contact support if the issue persists.
              </p>
              <div className="mt-4">
                <Button onClick={() => loadProposals()}>Try Again</Button>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="min-h-[calc(100vh-14rem)] py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">My Proposals</h1>
            <div className="flex space-x-3">
              <Link
                href="/jobs"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
              >
                Browse Jobs
              </Link>
            </div>
          </div>

          {/* Filters */}
          <ProposalFilters value={filters} onChange={handleFiltersChange} />

          {/* Proposals List */}
          <ProposalList
            proposals={proposals}
            currentUserRole="consultant"
            onWithdraw={handleWithdraw}
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
    </>
  );
}
