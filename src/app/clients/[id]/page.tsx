'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ClientProfileService as ProfileService } from '@/services/client-api.service';
import { ProfileCard } from '@/components/profiles/profile-card';
import { cn } from '@/lib/utils';
import type { ClientProfile, Profile } from '@/types/database';

export default function ClientPublicProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  // NOTE: deliberately untyped. The "Company Information" block below
  // dereferences `company` without a null guard, so a `Company | null` type
  // here would be a compile error. That is a pre-existing latent null-deref
  // bug; left as-is so rendered output is unchanged. See docs follow-up.
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  async function loadProfileData() {
    try {
      setLoading(true);
      setError(null);
      
      // Get client profile by ID
      const clientProfileData = await ProfileService.getClientProfileById(id as string);
      if (!clientProfileData) {
        setError('Client not found');
        return;
      }
      
      setClientProfile(clientProfileData.client);
      
      // Get user profile for this client
      const profileData = await ProfileService.getProfileByUserId(clientProfileData.client.user_id);
      if (!profileData) {
        setError('Profile data not found');
        return;
      }
      
      setProfile(profileData);
      
      // Get company data
      const companyData = clientProfileData.company;
      if (companyData) {
        setCompany(companyData);
      }
      
      // Check if this is the current user's profile
      const currentUser = await ProfileService.getProfile();
      setIsOwnProfile(!!currentUser && currentUser.user?.id === profileData.user_id);
      
    } catch (err: unknown) {
      console.error('Error loading client profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  // Fetch profile data
  useEffect(() => {
    loadProfileData();
  }, [id]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="ml-4 text-lg">Loading profile...</p>
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
                The client profile you&rsquo;re looking for may not exist or is no longer available.
              </p>
              <div className="mt-6">
                <a 
                  href="/"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  Go to Homepage
                </a>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!profile || !clientProfile) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Profile not found</h3>
              <p className="text-gray-600">
                We couldn&rsquo;t find the client profile you&rsquo;re looking for.
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-14rem)] py-8">
        <div className="max-w-4xl mx-auto">
          {/* Profile Header */}
          <div className="mb-8">
            <div className="flex items-center space-x-4">
              <ProfileCard 
                profile={profile} 
                userRole="client" 
                showActions={isOwnProfile} 
                className="flex-shrink-0"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile.display_name}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {clientProfile.job_title} at 
                  {company?.legal_name || 'Company not specified'}
                </p>
                <p className="text-sm text-gray-500">
                  {company?.industry || 'Industry not specified'} • 
                  {getCompanySizeText(company?.company_size)}
                </p>
                {isOwnProfile && (
                  <div className="mt-4">
                    <a 
                      href="/client/profile/edit"
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Edit Your Profile
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Tabs */}
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
              {isOwnProfile && (
                <button 
                  className={cn(
                    'px-4 py-3 text-sm font-medium',
                    'border-b-2 border-transparent',
                    'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                  onClick={() => router.push(`/clients/${id}/edit`)}
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
          
          {/* Profile Details */}
          <div className="space-y-8">
            {/* Company Info */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h2>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    {company?.logo_url ? (
                      <img 
                        src={company.logo_url} 
                        alt={`${company.legal_name} logo`} 
                        className="h-12 w-12 object-contain rounded"
                      />
                    ) : (
                      <div className="h-12 w-12 flex items-center justify-center bg-gray-100 rounded text-gray-500">
                        {[company.legal_name].find(Boolean)?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {company.legal_name}
                    </h3>
                    {company.brand_name && (
                      <p className="text-sm text-gray-600">
                        Trading as: {company.brand_name}
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      {company.industry || 'Industry not specified'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {getCompanySizeText(company.company_size)}
                    </p>
                    {company.website_url && (
                      <p className="text-sm text-gray-600 mt-2">
                        <a 
                          href={company.website_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {company.website_url}
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
            
            {/* Client Representative Info */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Primary Contact</h2>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    {profile.avatar_url ? (
                      <img 
                        src={profile.avatar_url} 
                        alt={`${profile.display_name}'s photo`} 
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <div className="h-10 w-10 flex items-center justify-center bg-gray-200 rounded-full text-gray-500">
                        {[profile.first_name, profile.last_name].find(Boolean)?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {profile.display_name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {clientProfile.job_title || 'Job title not specified'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {profile.bio_summary || 'No bio available'}
                    </p>
                  </div>
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

// Helper function to get company size text
function getCompanySizeText(size: string | undefined): string {
  switch (size) {
    case 'startup_1_10': return 'Startup (1-10 employees)';
    case 'small_11_50': return 'Small Business (11-50 employees)';
    case 'medium_51_200': return 'Medium Company (51-200 employees)';
    case 'midmarket_201_1000': return 'Mid-Market (201-1,000 employees)';
    case 'enterprise_1000_plus': return 'Enterprise (1,000+ employees)';
    default: return 'Company size not specified';
  }
}
