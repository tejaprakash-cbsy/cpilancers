import { cn } from '@/lib/utils';

interface CertificationBadgeProps {
  certification: { id: string; name: string; code: string | null; issuing_authority: string };
  consultantCertification?: { id: string; verification_status: string; credential_id: string | null; issue_date: string; expiry_date: string | null };
  size?: 'sm' | 'md';
  className?: string;
}

export default function CertificationBadge({ certification, consultantCertification, size = 'md', className = '' }: CertificationBadgeProps) {
  return <div className={cn('inline-flex items-center gap-2 rounded border bg-white px-3 py-2', size === 'sm' ? 'text-xs' : 'text-sm', className)}>
    <span className="font-medium">{certification.name}{certification.code ? ` (${certification.code})` : ''}</span>
    <span className="text-gray-500">{certification.issuing_authority}</span>
    {consultantCertification?.verification_status === 'verified' && <span className="text-green-600" aria-label="Verified">✓</span>}
  </div>;
}

export { CertificationBadge };
