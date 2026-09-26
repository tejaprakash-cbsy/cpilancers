import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';

interface PortfolioItemProps {
  portfolio: {
    id: string;
    title: string;
    client_industry: string;
    source_systems: string[];
    target_systems: string[];
    protocols_used: string[];
    challenge_markdown: string;
    solution_markdown: string;
    outcome_markdown: string | null;
    architecture_diagram_url: string | null;
    completed_at: string | null;
  };
  showDetails?: boolean;
  className?: string;
}

export type PortfolioItemData = PortfolioItemProps['portfolio'];

export default function PortfolioItem({
  portfolio,
  showDetails = false,
  className = '',
}: PortfolioItemProps) {
  const { 
    title, 
    client_industry, 
    source_systems, 
    target_systems, 
    protocols_used,
    architecture_diagram_url,
    completed_at,
    challenge_markdown,
    solution_markdown,
    outcome_markdown
  } = portfolio;
  
  // Format completion date
  const formattedDate = completed_at ? formatDate(completed_at) : 'Date not specified';
  
  // Truncate arrays for display
  const sourceSystemsDisplay = source_systems.slice(0, 3).join(', ');
  const sourceSystemsMore = source_systems.length > 3 ? ` +${source_systems.length - 3} more` : '';
  const targetSystemsDisplay = target_systems.slice(0, 3).join(', ');
  const targetSystemsMore = target_systems.length > 3 ? ` +${target_systems.length - 3} more` : '';
  const protocolsDisplay = protocols_used.slice(0, 3).join(', ');
  const protocolsMore = protocols_used.length > 3 ? ` +${protocols_used.length - 3} more` : '';

  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200', className)}>
      {/* Architecture Diagram */}
      {architecture_diagram_url && (
        <div className="relative h-48 w-full overflow-hidden rounded-t-lg">
          <Image
            src={architecture_diagram_url}
            alt={`${title} architecture diagram`}
            fill
            objectFit="cover"
            className="hover:scale-105 transition-transform duration-300"
          />
          {/* Overlay with title */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 transparent p-4">
            <h3 className="text-white font-semibold text-sm">{title}</h3>
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className="p-6">
        {/* Header */}
        <div className="mb-4 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">
              {client_industry} • {formattedDate}
            </p>
          </div>
          {/* External link icon would go here for live demo */}
        </div>
        
        {/* Systems Used */}
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-600 mb-2">Systems Involved</h4>
          <div className="space-y-1">
            {source_systems.length > 0 && (
              <>
                <p className="text-xs text-gray-600">Source Systems:</p>
                <p className="text-xs font-medium">{sourceSystemsDisplay}{sourceSystemsMore}</p>
              </>
            )}
            {target_systems.length > 0 && (
              <>
                <p className="text-xs text-gray-600 mt-2">Target Systems:</p>
                <p className="text-xs font-medium">{targetSystemsDisplay}{targetSystemsMore}</p>
              </>
            )}
            {protocols_used.length > 0 && (
              <>
                <p className="text-xs text-gray-600 mt-2">Protocols Used:</p>
                <p className="text-xs font-medium">{protocolsDisplay}{protocolsMore}</p>
              </>
            )}
          </div>
        </div>
        
        {/* Details toggle */}
        {showDetails && (
          <>
            <div className="mb-5">
              <h4 className="text-sm font-medium text-gray-600 mb-2">Challenge</h4>
              <p className="text-sm text-gray-700 line-clamp-4">
                {challenge_markdown}
              </p>
            </div>
            
            <div className="mb-5">
              <h4 className="text-sm font-medium text-gray-600 mb-2">Solution</h4>
              <p className="text-sm text-gray-700 line-clamp-4">
                {solution_markdown}
              </p>
            </div>
            
            {outcome_markdown && (
              <div className="mb-5">
                <h4 className="text-sm font-medium text-gray-600 mb-2">Outcome & Results</h4>
                <p className="text-sm text-gray-700 line-clamp-4">
                  {outcome_markdown}
                </p>
              </div>
            )}
          </>
        )}
        
        {!showDetails && (
          <div className="text-center">
            <button
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              onClick={(e) => {
                e.preventDefault();
                // In a real app, this would toggle the showDetails state
                console.log('Show details clicked');
              }}
            >
              View Details →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { PortfolioItem };
