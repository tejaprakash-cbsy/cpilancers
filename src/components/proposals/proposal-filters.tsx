'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ProposalStatus } from '@/lib/validations/proposal.schemas';

interface ProposalFilterValue {
  status: ProposalStatus[];
  sortBy: string;
  sortOrder: string;
}

interface ProposalFiltersProps {
  value: ProposalFilterValue;
  onChange: (filters: Partial<ProposalFilterValue>) => void;
}

const statusOptions: { value: ProposalStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'accepted', label: 'Accepted' },
];

export default function ProposalFilters({ value, onChange }: ProposalFiltersProps) {
  const toggleStatus = (status: ProposalStatus) => {
    const updated = value.status.includes(status)
      ? value.status.filter((s) => s !== status)
      : [...value.status, status];
    onChange({ ...value, status: updated });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>

      {/* Status Filters */}
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-600 mb-2">Status</p>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleStatus(opt.value)}
              className={cn(
                'px-3 py-1 text-sm rounded-full border transition-colors',
                value.status.includes(opt.value)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sort By */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-600 mb-1">Sort By</label>
        <select
          value={value.sortBy}
          onChange={(e) => onChange({ ...value, sortBy: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="submitted_at">Submitted At</option>
          <option value="proposed_price_cents">Proposed Price</option>
          <option value="proposed_duration_weeks">Duration</option>
        </select>
      </div>

      {/* Sort Order */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-600 mb-1">Sort Order</label>
        <select
          value={value.sortOrder}
          onChange={(e) => onChange({ ...value, sortOrder: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="desc">Newest / Highest First</option>
          <option value="asc">Oldest / Lowest First</option>
        </select>
      </div>
    </div>
  );
}
