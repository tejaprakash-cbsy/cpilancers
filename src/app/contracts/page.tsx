'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Handshake } from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ClientContractService, ClientProfileService } from '@/services/client-api.service';
import type { Contract } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function ContractsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof ClientProfileService.getProfile>> | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [profileData, contractsData] = await Promise.all([
          ClientProfileService.getProfile(),
          ClientContractService.listContracts()
        ]);
        setProfile(profileData);
        setContracts(contractsData);
      } catch (err: any) {
        setError(err.message || 'Failed to load contracts');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const isClient = profile?.user.role === 'client';
  const name = profile?.user.role === 'client' 
    ? profile?.company?.brand_name || profile?.company?.legal_name || 'Client' 
    : profile?.profile.first_name || 'Consultant';
  const initials = typeof name === 'string' ? name.substring(0, 2).toUpperCase() : 'CO';

  if (loading) {
    return (
      <DashboardShell accountName="Loading..." roleLabel="Loading..." initials="--" navItems={[]} footerItems={[]}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-gray-500">Loading contracts...</div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell 
      accountName={name} 
      roleLabel={`${isClient ? 'Client' : 'Consultant'} account`} 
      initials={initials} 
      navItems={[]} 
      footerItems={[]}
    >
      <div className="p-5 sm:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your active and completed engagements.</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {contracts.length === 0 ? (
            <div className="p-12 text-center">
              <Handshake className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No contracts yet</h3>
              <p className="text-gray-500 mt-1">You don't have any active or past contracts.</p>
              {isClient && (
                <Button className="mt-4" onClick={() => router.push('/jobs/create')}>
                  Post a Job
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Title</th>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Created</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {contracts.map(contract => (
                    <tr key={contract.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {contract.title}
                      </td>
                      <td className="px-6 py-4 capitalize text-gray-600">
                        {contract.contract_type.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatCurrency(contract.total_amount_cents)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                          ${contract.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                          ${contract.status === 'pending_acceptance' ? 'bg-yellow-100 text-yellow-800' : ''}
                          ${contract.status === 'completed' ? 'bg-gray-100 text-gray-800' : ''}
                          ${contract.status === 'cancelled' || contract.status === 'terminated' ? 'bg-red-100 text-red-800' : ''}
                          ${contract.status === 'disputed' ? 'bg-orange-100 text-orange-800' : ''}
                        `}>
                          {contract.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {formatDate(contract.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="outline" size="sm" onClick={() => router.push(`/contracts/${contract.id}`)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
