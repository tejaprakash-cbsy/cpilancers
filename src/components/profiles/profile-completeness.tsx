import { cn } from '@/lib/utils';

interface ProfileCompletenessProps {
  percentage: number;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export default function ProfileCompleteness({
  percentage,
  size = 'md',
  showText = true,
  className = '',
}: ProfileCompletenessProps) {
  // Determine color based on percentage
  let bgColor = 'bg-red-100';
  let textColor = 'text-red-800';
  
  if (percentage >= 80) {
    bgColor = 'bg-green-100';
    textColor = 'text-green-800';
  } else if (percentage >= 60) {
    bgColor = 'bg-yellow-100';
    textColor = 'text-yellow-800';
  } else if (percentage >= 40) {
    bgColor = 'bg-blue-100';
    textColor = 'text-blue-800';
  }
  
  // Size configurations
  const sizeConfigs: Record<string, { height: string; textSize: string }> = {
    sm: { height: 'h-2', textSize: 'text-xs' },
    md: { height: 'h-2.5', textSize: 'text-sm' },
    lg: { height: 'h-3', textSize: 'text-base' },
  };
  
  const { height, textSize } = sizeConfigs[size] || sizeConfigs.md;
  
  return (
    <div className={cn('w-full', className)}>
      {/* Label */}
      {showText && (
        <div className="mb-1 flex justify-between">
          <span className={cn(textSize, 'font-medium text-gray-700')}>
            Profile Completeness
          </span>
          <span className={cn(textSize, textColor, 'font-semibold')}>
            {percentage}%
          </span>
        </div>
      )}
      
      {/* Progress bar */}
      <div className="relative overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn(
            `${bgColor} ${height} transition-all duration-1000 ease-in-out`,
            'w-0' // Will be animated by parent component using inline style
          )}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Profile completeness, ${percentage} percent`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      
      {/* Optional suggestion text */}
      {showText && percentage < 100 && (
        <p className={cn(textSize, 'mt-1 text-gray-500')}>
{percentage < 40 
             ? 'Add more details to strengthen your profile' 
             : percentage < 60 
               ? 'You\'re off to a good start! Add skills and experience to continue.' 
               : percentage < 80 
                 ? 'Almost there! Complete your profile to stand out.' 
                 : 'Great job! Your profile is looking strong.'}
        </p>
      )}
    </div>
  );
}

export { ProfileCompleteness };
