'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { ProposalStatus } from '@/lib/validations/proposal.schemas';

interface ProposalListProps {
  proposals: Array<{
    id: string;
    status: ProposalStatus;
    proposed_duration_weeks: number;
    proposed_price_cents: number;
    submitted_at: string;
    consultant: {
      user_id: string;
      profiles: {
        first_name: string;
        last_name: string;
        display_name: string;
        avatar_url: string | null;
      } | null;
    } | null;
    job: {
      id: string;
      title: string;
      status: string;
      client_id: string;
    } | null;
  }>;
  currentUserRole: 'client' | 'consultant';
  onWithdraw?: (proposalId: string) => void;
  onShortlist?: (proposalId: string) => void;
  onReject?: (proposalId: string) => void;
  onAccept?: (proposalId: string) => void;
  className?: string;
}

export type ProposalListItem = ProposalListProps['proposals'][number];

export default function ProposalList({
  proposals,
  currentUserRole,
  onWithdraw,
  onShortlist,
  onReject,
  onAccept,
  className = '',
}: ProposalListProps) {
  const statusColors: Record<ProposalStatus, string> = {
    draft: 'bg-gray-100 text-gray-800',
    submitted: 'bg-blue-100 text-blue-800',
    shortlisted: 'bg-purple-100 text-purple-800',
    rejected: 'bg-red-100 text-red-800',
    withdrawn: 'bg-gray-200 text-gray-600',
    accepted: 'bg-green-100 text-green-800',
  };

  if (proposals.length === 0) {
    return (
      <div className={cn('bg-white rounded-xl shadow-sm border border-gray-200 p-8', className)}>
        <p className="text-center text-gray-500">No proposals found.</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {proposals.map((proposal) => (
        <div
          key={proposal.id}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {proposal.consultant?.profiles?.display_name ||
                  proposal.consultant?.profiles?.first_name ||
                  'Unknown'}
              </h3>
              <p className="text-sm text-gray-500">
                Submitted: {formatDate(proposal.submitted_at)}
              </p>
            </div>
            <span
              className={cn('px-2 py-1 text-xs font-medium rounded-full', statusColors[proposal.status])}
            >
              {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
            </span>
          </div>

          {/* Job Link */}
          {proposal.job && (
            <div className="mb-3">
              <Link
                href={`/jobs/${proposal.job.id}`}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {proposal.job.title}
              </Link>
            </div>
          )}

          {/* Key Stats */}
          <div className="flex gap-4 mb-3 text-sm">
            <span>
              <span className="text-gray-600">Duration:</span>{' '}
              <span className="text-gray-900 font-medium">
                {proposal.proposed_duration_weeks}w
              </span>
            </span>
            <span>
              <span className="text-gray-600">Price:</span>{' '}
              <span className="text-gray-900 font-medium">
                {formatCurrency(proposal.proposed_price_cents)}
              </span>
            </span>
          </div>

          {/* Actions */}
          {currentUserRole === 'client' &&
            ['submitted', 'shortlisted'].includes(proposal.status) && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex space-x-3">
                {proposal.status === 'submitted' && onShortlist && (
                  <button
                    onClick={() => onShortlist(proposal.id)}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg"
                  >
                    Shortlist
                  </button>
                )}
                {onReject && (
                  <button
                    onClick={() => onReject(proposal.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg"
                  >
                    Reject
                  </button>
                )}
                {proposal.status === 'shortlisted' && onAccept && (
                  <button
                    onClick={() => onAccept(proposal.id)}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg"
                  >
                    Accept
                  </button>
                )}
              </div>
            )}

          {currentUserRole === 'consultant' &&
            ['submitted', 'shortlisted'].includes(proposal.status) && onWithdraw && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => onWithdraw(proposal.id)}
                  className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg"
                >
                  Withdraw
                </button>
              </div>
            )}
        </div>
      ))}
    </div>
  );
}
