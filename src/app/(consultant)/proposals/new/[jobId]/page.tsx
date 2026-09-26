'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ClientAuthService as AuthService, ClientJobService as JobService } from '@/services/client-api.service';
import ProposalForm from '@/components/proposals/proposal-form';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { formatDate } from '@/lib/utils';
import type { Job } from '@/types/database';

export default function ProposalNewPage() {
  const { jobId } = useParams();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setUserProfile] = useState<unknown>(null);
  const [isConsultant, setIsConsultant] = useState(false);

  async function loadJobAndProfile() {
    try {
      setLoading(true);
      setError(null);

      // Load job details
      const jobData = await JobService.getJobById(jobId as string);
      if (!jobData) {
        setError('Job not found');
        return;
      }
      setJob(jobData);

      // Load current user profile
      const profileData = await AuthService.getCurrentUser();
      if (profileData) {
        setUserProfile(profileData);
        setIsConsultant(profileData.role === 'consultant');
      }

      // If not a consultant, redirect
      if (!isConsultant) {
        router.push('/');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobAndProfile();
  }, [jobId]);

  const handleProposalSubmitted = () => {
    router.push('/consultant/proposals');
    router.refresh();
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="ml-4 text-lg">Loading...</p>
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
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6">
              <h3 className="text-lg font-medium mb-4">{error}</h3>
              <p className="text-gray-600">
                The job you&rsquo;re looking for may not exist or is no longer available.
              </p>
              <div className="mt-4">
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

  // Redirect if not a consultant
  if (!isConsultant) {
    router.push('/');
    return null;
  }

  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-14rem)] py-8">
        <div className="max-w-4xl mx-auto">
          {/* Job Summary */}
          <div className="mb-6">
            <div className="border-b pb-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Applying to: {job.title}
              </h2>
              <div className="flex flex-wrap gap-2 text-sm text-gray-500">
                <span>Posted: {formatDate(job.created_at)}</span>
                <span className={cn(
                  'px-2 py-1 text-xs font-medium rounded-full',
                  job.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                )}>
                  {job.status}
                </span>
              </div>
            </div>
          </div>

          {/* Proposal Form */}
          <ProposalForm jobId={job.id} onSubmitted={handleProposalSubmitted} />
        </div>
      </main>
      <Footer />
    </>
  );
}
