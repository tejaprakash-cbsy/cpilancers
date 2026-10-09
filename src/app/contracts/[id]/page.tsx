'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { ArrowLeft, CheckCircle, Clock, Info, AlertTriangle, FileText, Plus } from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ClientContractService, ClientProfileService, ClientPaymentService } from '@/services/client-api.service';
import type { Contract, Milestone } from '@/types/database';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof ClientProfileService.getProfile>> | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileData, contractData, milestonesData, paymentsData] = await Promise.all([
        ClientProfileService.getProfile(),
        ClientContractService.getContract(id),
        ClientContractService.getMilestones(id),
        ClientPaymentService.listPayments({ contract_id: id })
      ]);
      setProfile(profileData);
      setContract(contractData);
      setMilestones(milestonesData);
      setPayments(paymentsData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load contract details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const isClient = profile?.user.role === 'client';
  const name = profile?.user.role === 'client' 
    ? profile?.company?.brand_name || profile?.company?.legal_name || 'Client' 
    : profile?.profile.first_name || 'Consultant';
  const initials = typeof name === 'string' ? name.substring(0, 2).toUpperCase() : 'CO';

  const handleUpdateMilestoneStatus = async (milestoneId: string, status: string) => {
    try {
      setActionLoading(true);
      await ClientContractService.updateMilestone(id, milestoneId, { status });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update milestone');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFundMilestone = async (milestoneId: string) => {
    try {
      setActionLoading(true);
      const { data: createData } = await ClientPaymentService.createPayment(milestoneId);
      // Simulate successful Razorpay checkout flow
      await ClientPaymentService.confirmPayment(createData.payment_id);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to fund milestone');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReleasePayment = async (paymentId: string) => {
    try {
      setActionLoading(true);
      await ClientPaymentService.releasePayment(paymentId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to release payment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateContractStatus = async (status: string) => {
    try {
      setActionLoading(true);
      await ClientContractService.updateContractStatus(id, status as any);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update contract');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !contract) {
    return (
      <DashboardShell accountName="Loading..." roleLabel="Loading..." initials="--" navItems={[]} footerItems={[]}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-gray-500">Loading contract...</div>
        </div>
      </DashboardShell>
    );
  }

  if (error && !contract) {
    return (
      <DashboardShell accountName={name} roleLabel="Error" initials={initials} navItems={[]} footerItems={[]}>
        <div className="p-5 sm:p-8 max-w-4xl mx-auto">
          <div className="p-6 bg-red-50 text-red-700 border border-red-200 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Error</h2>
            <p>{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push('/contracts')}>
              Back to Contracts
            </Button>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (!contract) return null;

  return (
    <DashboardShell 
      accountName={name} 
      roleLabel={`${isClient ? 'Client' : 'Consultant'} account`} 
      initials={initials} 
      navItems={[]} 
      footerItems={[]}
    >
      <div className="p-5 sm:p-8 max-w-5xl mx-auto pb-24">
        <button 
          onClick={() => router.push('/contracts')}
          className="flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Contracts
        </button>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8 shadow-sm">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{contract.title}</h1>
              <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
                <span className="flex items-center">
                  <FileText className="w-4 h-4 mr-1.5" />
                  {contract.contract_type.replace('_', ' ')}
                </span>
                <span className="flex items-center">
                  <Clock className="w-4 h-4 mr-1.5" />
                  Created {formatDate(contract.created_at)}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize
                ${contract.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                ${contract.status === 'pending_acceptance' ? 'bg-yellow-100 text-yellow-800' : ''}
                ${contract.status === 'completed' ? 'bg-gray-100 text-gray-800' : ''}
                ${contract.status === 'cancelled' || contract.status === 'terminated' ? 'bg-red-100 text-red-800' : ''}
                ${contract.status === 'disputed' ? 'bg-orange-100 text-orange-800' : ''}
              `}>
                {contract.status.replace('_', ' ')}
              </span>
              
              {isClient && contract.status === 'active' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleUpdateContractStatus('completed')}
                  disabled={actionLoading}
                >
                  Mark Completed
                </Button>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Terms</h3>
                <div className="prose prose-sm max-w-none text-gray-600">
                  {contract.terms_markdown}
                </div>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Total Amount</h3>
                  <div className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(contract.total_amount_cents)}
                  </div>
                </div>
                
                {contract.start_date && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Start Date</h3>
                    <div className="text-base text-gray-900">
                      {new Date(contract.start_date).toLocaleDateString()}
                    </div>
                  </div>
                )}
                
                {contract.end_date && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">End Date</h3>
                    <div className="text-base text-gray-900">
                      {new Date(contract.end_date).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Milestones Section */}
        {contract.contract_type === 'fixed_price' && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Milestones</h2>
              {isClient && contract.status === 'active' && (
                <Button size="sm" variant="outline" className="flex items-center" disabled>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Milestone
                </Button>
              )}
            </div>

            {milestones.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 shadow-sm">
                No milestones have been created for this contract yet.
              </div>
            ) : (
              <div className="space-y-4">
                {milestones.map((milestone) => (
                  <div key={milestone.id} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{milestone.title}</h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                            ${milestone.status === 'pending' ? 'bg-gray-100 text-gray-800' : ''}
                            ${milestone.status === 'funded' ? 'bg-blue-100 text-blue-800' : ''}
                            ${milestone.status === 'in_progress' ? 'bg-purple-100 text-purple-800' : ''}
                            ${milestone.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' : ''}
                            ${milestone.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                            ${milestone.status === 'disputed' ? 'bg-orange-100 text-orange-800' : ''}
                          `}>
                            {milestone.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{milestone.description}</p>
                        <div className="flex items-center text-sm text-gray-500 gap-4">
                          <span>Amount: <strong className="text-gray-900">{formatCurrency(milestone.amount_cents)}</strong></span>
                          {milestone.due_date && <span>Due: {new Date(milestone.due_date).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 md:justify-end shrink-0 min-w-[200px]">
                        {isClient && milestone.status === 'pending' && (
                          <Button size="sm" onClick={() => handleFundMilestone(milestone.id)} disabled={actionLoading}>
                            Fund
                          </Button>
                        )}
                        {!isClient && milestone.status === 'funded' && (
                          <Button size="sm" onClick={() => handleUpdateMilestoneStatus(milestone.id, 'in_progress')} disabled={actionLoading}>
                            Start Work
                          </Button>
                        )}
                        {!isClient && milestone.status === 'in_progress' && (
                          <Button size="sm" onClick={() => handleUpdateMilestoneStatus(milestone.id, 'submitted')} disabled={actionLoading}>
                            Submit Work
                          </Button>
                        )}
                        {isClient && milestone.status === 'submitted' && (
                          <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                            const p = payments.find(p => p.milestone_id === milestone.id);
                            if (p) {
                              handleReleasePayment(p.id);
                            } else {
                              handleUpdateMilestoneStatus(milestone.id, 'approved');
                            }
                          }} disabled={actionLoading}>
                            Approve & Release
                          </Button>
                        )}
                        {isClient && milestone.status === 'submitted' && (
                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleUpdateMilestoneStatus(milestone.id, 'disputed')} disabled={actionLoading}>
                            Request Revisions
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {milestone.deliverable_notes && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-100">
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Submission Notes</h4>
                        <p className="text-sm text-gray-600">{milestone.deliverable_notes}</p>
                      </div>
                    )}
                    
                    {milestone.revision_notes && (
                      <div className="mt-4 p-4 bg-orange-50 rounded-md border border-orange-100">
                        <h4 className="text-sm font-medium text-orange-800 mb-1">Revision Requested</h4>
                        <p className="text-sm text-orange-700">{milestone.revision_notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
