import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ProfileCardProps {
  profile: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    avatar_url: string | null;
    bio_summary: string | null;
  };
  userRole: 'client' | 'consultant' | 'admin';
  showActions?: boolean;
  className?: string;
}

export default function ProfileCard({
  profile,
  userRole,
  showActions = false,
  className = '',
}: ProfileCardProps) {
  const { first_name, last_name, display_name, avatar_url, bio_summary } = profile;
  
  // Determine initials for fallback avatar
  const initials = `${first_name.charAt(0)}${last_name.charAt(0)}`.toUpperCase();
  
  // Role-specific title
  const roleTitle = userRole === 'consultant' 
    ? 'SAP Integration Consultant' 
    : userRole === 'client'
      ? 'Enterprise Client'
      : 'Administrator';

  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200', className)}>
      {/* Avatar */}
      <div className="relative h-48 w-full overflow-hidden rounded-t-lg">
        {avatar_url ? (
          <Image
            src={avatar_url}
            alt={`${display_name}'s profile picture`}
            fill
            objectFit="cover"
            className="hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 text-gray-400">
            <span className="text-xl font-medium">{initials}</span>
          </div>
        )}
        {/* Online/Offline indicator */}
        <div className="absolute bottom-2 right-2 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white">
          {/* In a real app, this would come from presence/user status */}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-6">
        {/* Name and Role */}
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {display_name}
            {/* Verified badge would go here */}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{roleTitle}</p>
        </div>
        
        {/* Bio */}
        {bio_summary && (
          <p className="text-sm text-gray-600 line-clamp-3 mb-4">
            {bio_summary}
          </p>
        )}
        
        {/* Actions */}
        {showActions && (
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <Link
              href={`/${userRole}s/${profile.id}/edit`}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Edit Profile
            </Link>
            <button
              className="text-sm text-gray-600 hover:text-gray-800 font-medium"
              onClick={() => console.log('View profile clicked')}
            >
              View Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { ProfileCard };
