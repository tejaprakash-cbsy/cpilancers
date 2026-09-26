'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClientJobService as JobService, ClientAuthService as AuthService } from '@/services/client-api.service';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { Job } from '@/types/database';

/**
 * The jobs API returns the `jobs` row plus additional requirement columns
 * (project_type, *_requirements, ...) that are validated by job.schemas.ts but
 * are not yet declared on the shared `Job` interface.
 */
type JobDetail = Job & {
  project_type?: string | null;
  experience_required?: number | null;
  authentication_requirements?: string | null;
  data_transformation_requirements?: string | null;
  error_handling_requirements?: string | null;
  monitoring_requirements?: string | null;
  testing_requirements?: string | null;
  sap_products?: string[] | null;
  project_deadline?: string | null;
};

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setUserProfile] = useState<unknown>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isConsultant, setIsConsultant] = useState(false);

  async function loadJobData() {
    try {
      setLoading(true);
      setError(null);
      
      // Get job details
      const jobData = await JobService.getJobById(id as string);
      if (!jobData) {
        setError('Job not found');
        return;
      }
      setJob(jobData);
      
      // Get current user profile to check ownership
      const profileData = await AuthService.getCurrentUser();
      if (profileData) {
        setUserProfile(profileData);
        
        // Check if user is the client who posted this job
        if (profileData.role === 'client') {
          const clientId = await JobService.getClientIdByUserId(profileData.id);
          setIsOwner(jobData.client_id === clientId);
        }
        
        // Check if user is a consultant
        setIsConsultant(profileData.role === 'consultant');
      }
    } catch (err: unknown) {
      console.error('Error loading job:', err);
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }

  // Fetch job and user data
  useEffect(() => {
    loadJobData();
  }, [id]);

  // Handle job actions
  const handlePublish = async () => {
    try {
      await JobService.publishJob(id as string);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish job');
    }
  };

  const handleClose = async () => {
    try {
      await JobService.closeJob(id as string);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to close job');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      return;
    }
    
    try {
      await JobService.deleteJob(id as string);
      router.push('/jobs');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="ml-4 text-lg">Loading job details...</p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6 text-center">
              <h3 className="text-lg font-medium mb-4">{error}</h3>
              <p className="text-gray-600">
                The job you&rsquo;re looking for may not exist or is no longer available.
              </p>
              <div className="mt-6">
                <a 
                  href="/jobs"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  Go to Job Listings
                </a>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!job) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Job not found</h3>
              <p className="text-gray-600">
                We couldn&rsquo;t find the job you&rsquo;re looking for.
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // Format budget display
  let budgetDisplay = 'Not specified';
  if (job.budget_type === 'fixed_price' && job.budget_fixed_cents !== null) {
    budgetDisplay = formatCurrency(job.budget_fixed_cents);
  } else if (job.budget_type === 'range' && job.budget_min_cents !== null && job.budget_max_cents !== null) {
    budgetDisplay = `${formatCurrency(job.budget_min_cents)} - ${formatCurrency(job.budget_max_cents)}`;
  } else if (job.budget_type === 'hourly_rate') {
    budgetDisplay = 'Hourly rate (see description)';
  }

  // Format date
  const formattedDate = formatDate(job.created_at);

  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-14rem)] py-8">
        <div className="max-w-4xl mx-auto">
          {/* Job Header */}
          <div className="mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
                <div className="flex flex-wrap gap-2 mt-2">
                  {/* Status badge */}
                  <span className={cn(
                    'px-2 py-1 text-xs font-medium rounded-full',
                    getStatusColor(job.status)
                  )}>
                    {job.status.charAt(0).toUpperCase() + job.status.slice(1).replace('_', ' ')}
                  </span>
                  {/* Date */}
                  <span className="text-sm text-gray-500">
                    Posted: {formattedDate}
                  </span>
                </div>
              </div>
              {/* Action buttons (only for job owner) */}
              {isOwner && (
                <div className="flex space-x-3">
                  {job.status === 'draft' && (
                    <>
                      <button
                        onClick={handlePublish}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                      >
                        Publish Job
                      </button>
                      <button
                        onClick={handleDelete}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
                      >
                        Delete Draft
                      </button>
                    </>
                  )}
                  {['open', 'in_review', 'hired'].includes(job.status) && (
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
                    >
                      Close Job
                    </button>
                  )}
                </div>
              )}
              {/* Apply button (only for consultants) */}
              {!isOwner && isConsultant && (
                <button
                  onClick={() => router.push(`/consultant/proposals/new/${id}`)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg"
                >
                  Apply as Consultant
                </button>
              )}
            </div>
          </div>
          
          {/* Job Details Tabs */}
          <div className="mb-6">
            <div className="flex border-b border-gray-200">
              <button 
                className={cn(
                  'px-4 py-3 text-sm font-medium',
                  'border-b-2 border-transparent',
                  'text-blue-600 border-blue-500',
                  'hover:text-blue-800 hover:border-blue-300'
                )}
                onClick={() => {/* Stay on overview tab */}}
              >
                Overview
              </button>
              {isOwner && (
                <button 
                  className={cn(
                    'px-4 py-3 text-sm font-medium',
                    'border-b-2 border-transparent',
                    'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                  onClick={() => router.push(`/jobs/${id}/edit`)}
                >
                  Edit Job
                </button>
              )}
            </div>
          </div>
          
          {/* Job Content */}
          <div className="space-y-8">
            {/* Basic Information */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Project Type</h3>
                  <p className="text-base text-gray-800">
                    {job.project_type || 'Not specified'}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Experience Required</h3>
                  <p className="text-base text-gray-800">
                    {job.experience_required || 0}+ years
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Estimated Duration</h3>
                  <p className="text-base text-gray-800">
                    {job.estimated_duration_weeks} week{job.estimated_duration_weeks !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Budget</h3>
                  <p className="text-base text-gray-800 font-medium">
                    {budgetDisplay}
                  </p>
                </div>
              </div>
            </section>
            
            {/* Description */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h2>
              <div className="prose prose-sm max-w-none text-gray-700">
                {/* In a real app, we'd use a markdown renderer here */}
                <p>{job.description_markdown}</p>
              </div>
            </section>
            
            {/* Deliverables */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Expected Deliverables</h2>
              <div className="prose prose-sm max-w-none text-gray-700">
                <p>{job.deliverables_markdown}</p>
              </div>
            </section>
            
            {/* SAP Specific Information */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">SAP Integration Requirements</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">SAP Products Involved</h3>
                  <p className="text-base text-gray-800">
                    {/* We'd need to fetch this from a related table or job field */}
                    {/* For now, showing placeholder */}
                    Multiple SAP systems
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Source Systems</h3>
                  <p className="text-base text-gray-800">
                    {job.source_systems.join(', ') || 'Not specified'}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Target Systems</h3>
                  <p className="text-base text-gray-800">
                    {job.target_systems.join(', ') || 'Not specified'}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Integration Type</h3>
                  <p className="text-base text-gray-800 capitalize">
                    {job.integration_type}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Required Protocols</h3>
                  <p className="text-base text-gray-800">
                    {job.protocols.map((p: string) => p.toUpperCase()).join(', ') || 'Not specified'}
                  </p>
                </div>
              </div>
            </section>
            
            {/* Requirements Sections */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Technical Requirements</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-600">Authentication Requirements</h3>
                  <p className="text-sm text-gray-700">
                    {job.authentication_requirements || 'Not specified'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600">Data Transformation Requirements</h3>
                  <p className="text-sm text-gray-700">
                    {job.data_transformation_requirements || 'Not specified'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600">Error Handling Requirements</h3>
                  <p className="text-sm text-gray-700">
                    {job.error_handling_requirements || 'Not specified'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600">Monitoring Requirements</h3>
                  <p className="text-sm text-gray-700">
                    {job.monitoring_requirements || 'Not specified'}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

// Helper function to get status color
function getStatusColor(status: string): string {
  switch (status) {
    case 'draft': return 'bg-gray-100 text-gray-800';
    case 'open': return 'bg-green-100 text-green-800';
    case 'in_review': return 'bg-blue-100 text-blue-800';
    case 'hired': return 'bg-purple-100 text-purple-800';
    case 'completed': return 'bg-indigo-100 text-indigo-800';
    case 'cancelled': return 'bg-red-100 text-red-800';
    case 'closed': return 'bg-gray-200 text-gray-600';
    default: return 'bg-gray-100 text-gray-800';
  }
}
