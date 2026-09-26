import { cn } from '@/lib/utils';

interface SkillBadgeProps {
  skill: {
    id: string;
    name: string;
    slug: string;
    category: string;
  };
  yearsExperience?: number;
  proficiencyLevel?: string;
  isPrimary?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export type SkillBadgeSkill = SkillBadgeProps['skill'];

export default function SkillBadge({
  skill,
  yearsExperience,
  proficiencyLevel,
  isPrimary = false,
  size = 'md',
  className = '',
}: SkillBadgeProps) {
  const { name, category } = skill;
  
  // Category to color mapping
  const categoryColors: Record<string, string> = {
    core_cpi: 'bg-blue-100 text-blue-800',
    integration_suite: 'bg-green-100 text-green-800',
    sap_system: 'bg-purple-100 text-purple-800',
    protocol: 'bg-yellow-100 text-yellow-800',
    scripting: 'bg-indigo-100 text-indigo-800',
    architecture: 'bg-pink-100 text-pink-800',
    security: 'bg-red-100 text-red-800',
    other: 'bg-gray-100 text-gray-800',
  };
  
  // Proficiency to label mapping
  const proficiencyLabels: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    expert: 'Expert',
  };
  
  // Size classes
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-2',
    lg: 'text-base px-4 py-3',
  };
  
  const bgColor = categoryColors[category] || categoryColors.other;
  const proficiencyLabel = proficiencyLabels[proficiencyLevel || ''] || '';
  
  return (
    <div className={cn(
      `inline-flex items-center ${bgColor} rounded-full ${sizeClasses[size]} ` +
      `font-medium ${isPrimary ? 'ring-2 ring-blue-500' : ''}`,
      className
    )}
    >
      {isPrimary && (
        <span className="mr-1 text-xs bg-blue-500 text-white rounded-full">
          PRI
        </span>
      )}
      <span className="mr-2">{name}</span>
      {yearsExperience !== undefined && (
        <span className="mr-2">• {yearsExperience}+ yrs</span>
      )}
      {proficiencyLevel && (
        <span className="text-xs">{proficiencyLabel}</span>
      )}
    </div>
  );
}

export { SkillBadge };
