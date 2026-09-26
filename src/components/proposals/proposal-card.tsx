'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { ProposalStatus } from '@/lib/validations/proposal.schemas';
import Link from 'next/link';

interface ProposedMilestone {
  title: string;
  amount_cents: number;
}

interface ProposalCardProps {
  proposal: {
    id: string;
    status: ProposalStatus;
    cover_letter_markdown: string;
    technical_solution_markdown: string;
    proposed_duration_weeks: number;
    proposed_price_cents: number;
    proposed_milestones: ProposedMilestone[];
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
    } | null;
  };
  currentUserRole: 'client' | 'consultant';
  onWithdraw?: (proposalId: string) => void;
  onShortlist?: (proposalId: string) => void;
  onReject?: (proposalId: string) => void;
  onAccept?: (proposalId: string) => void;
  className?: string;
}

const statusColors: Record<ProposalStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  shortlisted: 'bg-purple-100 text-purple-800',
  rejected: 'bg-red-100 text-red-800',
  withdrawn: 'bg-gray-200 text-gray-600',
  accepted: 'bg-green-100 text-green-800',
};

const statusLabels: Record<ProposalStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  accepted: 'Accepted',
};

export default function ProposalCard({
  proposal,
  currentUserRole,
  onWithdraw,
  onShortlist,
  onReject,
  onAccept,
  className = '',
}: ProposalCardProps) {
  const {
    id,
    status,
    proposed_duration_weeks,
    proposed_price_cents,
    submitted_at,
    consultant,
    job,
  } = proposal;

  const consultantName = consultant?.profiles?.display_name || consultant?.profiles?.first_name || 'Unknown';

  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-200 p-6', className)}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{consultantName}</h3>
          <p className="text-sm text-gray-500">Submitted: {formatDate(submitted_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('px-2 py-1 text-xs font-medium rounded-full', statusColors[status])}>
            {statusLabels[status]}
          </span>
        </div>
      </div>

      {/* Job Reference */}
      {job && (
        <div className="mb-4">
          <Link
            href={`/jobs/${job.id}`}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {job.title}
          </Link>
        </div>
      )}

      {/* Proposal Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Proposed Duration</p>
          <p className="text-base text-gray-800">
            {proposed_duration_weeks} week{proposed_duration_weeks !== 1 ? 's' : ''}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Proposed Price</p>
          <p className="text-base text-gray-800 font-medium">
            {formatCurrency(proposed_price_cents)}
          </p>
        </div>
      </div>

      {/* Milestones Summary */}
      {proposal.proposed_milestones && proposal.proposed_milestones.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-600 mb-2">Milestones ({proposal.proposed_milestones.length})</p>
          <div className="space-y-1">
            {proposal.proposed_milestones.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{m.title}</span>
                <span className="text-gray-500">{formatCurrency(m.amount_cents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cover Letter Preview */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-600 mb-1">Cover Letter</p>
        <p className="text-sm text-gray-700 line-clamp-3">
          {proposal.cover_letter_markdown}
        </p>
      </div>

      {/* Client Actions */}
      {currentUserRole === 'client' &&
        ['submitted', 'shortlisted'].includes(status) && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex space-x-3">
            {status === 'submitted' && onShortlist && (
              <button
                onClick={() => onShortlist(id)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-sm"
              >
                Shortlist
              </button>
            )}
            {onReject && (
              <button
                onClick={() => onReject(id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm"
              >
                Reject
              </button>
            )}
            {status === 'shortlisted' && onAccept && (
              <button
                onClick={() => onAccept(id)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg text-sm"
              >
                Accept
              </button>
            )}
          </div>
        )}

      {/* Consultant Actions */}
      {currentUserRole === 'consultant' && ['submitted', 'shortlisted'].includes(status) && onWithdraw && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => onWithdraw(id)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg text-sm"
          >
            Withdraw Proposal
          </button>
        </div>
      )}
    </div>
  );
}
