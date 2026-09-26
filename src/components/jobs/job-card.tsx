import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

interface JobCardProps {
  job: {
    id: string;
    title: string;
    description_markdown: string;
    integration_type: string;
    source_systems: string[];
    target_systems: string[];
    protocols: string[];
    expected_throughput_tier: string;
    complexity: string;
    estimated_duration_weeks: number;
    budget_type: string;
    budget_fixed_cents: number | null;
    budget_min_cents: number | null;
    budget_max_cents: number | null;
    status: string;
    views_count: number;
    proposals_count: number;
    client: {
      user_id: string;
      profiles: {
        first_name: string;
        last_name: string;
        display_name: string;
        avatar_url: string | null;
      } | null;
    } | null;
    company: {
      legal_name: string;
      brand_name: string | null;
      industry: string;
      company_size: string;
      logo_url: string | null;
    } | null;
    created_at: string;
  };
  showActions?: boolean;
  className?: string;
}

export type JobCardJob = JobCardProps['job'];

export default function JobCard({
  job,
  showActions = false,
  className = '',
}: JobCardProps) {
  const { 
    title, 
    description_markdown,
    integration_type,
    source_systems,
    target_systems,
    protocols,
    estimated_duration_weeks,
    budget_type,
    budget_fixed_cents,
    budget_min_cents,
    budget_max_cents,
    status,
    views_count,
    proposals_count,
    complexity,
    created_at
  } = job;
  
  // Format budget display
  let budgetDisplay = '';
  if (budget_type === 'fixed_price' && budget_fixed_cents !== null) {
    budgetDisplay = formatCurrency(budget_fixed_cents);
  } else if (budget_type === 'range' && budget_min_cents !== null && budget_max_cents !== null) {
    budgetDisplay = `${formatCurrency(budget_min_cents)} - ${formatCurrency(budget_max_cents)}`;
  } else if (budget_type === 'hourly_rate') {
    budgetDisplay = 'Hourly rate';
  } else {
    budgetDisplay = 'Budget not specified';
  }
  
  // Format date
  const formattedDate = formatDate(created_at);
  
  // Truncate description for preview
  const descriptionPreview = description_markdown.length > 150 
    ? description_markdown.substring(0, 150) + '...'
    : description_markdown;
  
  // Status to color mapping
  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    open: 'bg-green-100 text-green-800',
    in_review: 'bg-blue-100 text-blue-800',
    hired: 'bg-purple-100 text-purple-800',
    completed: 'bg-indigo-100 text-indigo-800',
    cancelled: 'bg-red-100 text-red-800',
    closed: 'bg-gray-200 text-gray-600',
  };
  
  const bgColor = statusColors[status] || statusColors.draft;

  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200', className)}>
      {/* Status badge */}
      <div className="absolute top-3 left-3 px-2 py-1 text-xs font-medium">
        <span className={cn(bgColor, 'rounded-full')}>
          {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
        </span>
      </div>
      
      {/* Content */}
      <div className="p-6">
        {/* Header */}
        <div className="mb-4 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1 truncate max-w-xs">
              {descriptionPreview}
            </p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-xs text-gray-500">{formattedDate}</p>
            <p className="text-xs text-gray-500">
              {views_count} views • {proposals_count} proposals
            </p>
          </div>
        </div>
        
        {/* Job details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Integration Type</p>
            <p className="text-base text-gray-800 capitalize">{integration_type}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Complexity</p>
            <p className="text-base text-gray-800 capitalize">{complexity}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Duration</p>
            <p className="text-base text-gray-800">
              {estimated_duration_weeks} week{estimated_duration_weeks !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Budget</p>
            <p className="text-base text-gray-800 font-medium">{budgetDisplay}</p>
          </div>
        </div>
        
        {/* Systems involved */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-600 mb-1">Systems Involved</p>
          <div className="flex flex-wrap gap-2">
            {source_systems.map((sys) => (
              <span key={sys} className="bg-blue-50 text-blue-800 text-xs px-2 py-1 rounded">
                {sys}
              </span>
            ))}
            {target_systems.map((sys) => (
              <span key={sys} className="bg-green-50 text-green-800 text-xs px-2 py-1 rounded">
                {sys}
              </span>
            ))}
          </div>
        </div>
        
        {/* Protocols */}
        {protocols.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-600 mb-1">Protocols</p>
            <div className="flex flex-wrap gap-2">
              {protocols.map((protocol) => (
                <span key={protocol} className="bg-yellow-50 text-yellow-800 text-xs px-2 py-1 rounded">
                  {protocol.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Actions */}
        {showActions && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex justify-end space-x-3">
              <Link
                href={`/jobs/${job.id}`}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                View Details
              </Link>
              {/* Edit and delete buttons would only show for job owner */}
              {/* We'll conditionally render based on props or context */}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { JobCard };
