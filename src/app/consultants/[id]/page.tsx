'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ClientProfileService as ProfileService } from '@/services/client-api.service';
import { ProfileCard } from '@/components/profiles/profile-card';
import { SkillBadge, type SkillBadgeSkill } from '@/components/profiles/skill-badge';
import { CertificationBadge } from '@/components/profiles/certification-badge';
import { PortfolioItem, type PortfolioItemData } from '@/components/profiles/portfolio-item';
import { cn } from '@/lib/utils';
import type { ConsultantProfile, Profile } from '@/types/database';

/** A consultant_skill row joined with its `skill` row, as returned by the profile API. */
type ConsultantSkillWithSkill = SkillBadgeSkill & {
  years_experience?: number;
  proficiency_level?: string;
  is_primary?: boolean;
};

/**
 * A consultant_certifications row, optionally joined with its `certifications`
 * row. The page renders `cert.certifications || cert`, so the badge may receive
 * either shape.
 */
type CertificationWithDetail = {
  id: string;
  verification_status: string;
  credential_id: string | null;
  issue_date: string;
  expiry_date: string | null;
  certifications?: { id: string; name: string; code: string | null; issuing_authority: string };
};

export default function ConsultantPublicProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [consultantProfile, setConsultantProfile] = useState<ConsultantProfile | null>(null);
  const [skills, setSkills] = useState<ConsultantSkillWithSkill[]>([]);
  const [certifications, setCertifications] = useState<CertificationWithDetail[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  async function loadProfileData() {
    try {
      setLoading(true);
      setError(null);
      
      // Get consultant profile by ID
      const consultantProfileData = await ProfileService.getConsultantProfileById(id as string);
      if (!consultantProfileData) {
        setError('Consultant not found');
        return;
      }
      
      setConsultantProfile(consultantProfileData.consultant);
      
      // Get user profile for this consultant
      const profileData = consultantProfileData.profile;
      if (!profileData) {
        setError('Profile data not found');
        return;
      }
      
      setProfile(profileData);
      
      // Check if this is the current user's profile
      const currentUser = await ProfileService.getProfile();
      setIsOwnProfile(!!currentUser && currentUser.user?.id === profileData.user_id);
      
      setSkills(consultantProfileData.skills as ConsultantSkillWithSkill[]);
      setCertifications(consultantProfileData.certifications as CertificationWithDetail[]);
      setPortfolioItems(consultantProfileData.portfolios as PortfolioItemData[]);
      
    } catch (err: unknown) {
      console.error('Error loading consultant profile:', err);
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
                The consultant profile you&rsquo;re looking for may not exist or is no longer available.
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

  if (!profile || !consultantProfile) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Profile not found</h3>
              <p className="text-gray-600">
                We couldn&rsquo;t find the consultant profile you&rsquo;re looking for.
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
                userRole="consultant" 
                showActions={isOwnProfile} 
                className="flex-shrink-0"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile.display_name}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {consultantProfile.professional_headline} • 
                  {consultantProfile.years_sap_experience}+ years SAP experience
                </p>
                <p className="text-sm text-gray-500">
                  {consultantProfile ? 
                    `$${(consultantProfile.hourly_rate_cents / 100).toFixed(2)}/hr` : 
                    'Rate not specified'
                  } • 
                  {consultantProfile.availability_status === 'available' 
                    ? 'Available for work' 
                    : consultantProfile.availability_status === 'partially_available'
                      ? 'Partially available'
                      : 'Currently unavailable'}
                </p>
                {isOwnProfile && (
                  <div className="mt-4">
                    <a 
                      href="/consultant/profile/edit"
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
                  onClick={() => router.push(`/consultant/${id}/edit`)}
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
          
          {/* Profile Details */}
          <div className="space-y-8">
            {/* Professional Info */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Professional Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Professional Headline</h3>
                  <p className="text-base text-gray-800">
                    {consultantProfile.professional_headline}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">SAP Experience</h3>
                  <p className="text-base text-gray-800">
                    {consultantProfile.years_sap_experience}+ years
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">CPI Experience</h3>
                  <p className="text-base text-gray-800">
                    {consultantProfile.years_cpi_experience}+ years
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Hourly Rate</h3>
                  <p className="text-base text-gray-800">
                    ${(consultantProfile.hourly_rate_cents / 100).toFixed(2)}/hr
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Availability</h3>
                  <p className="text-base text-gray-800">
                    {getAvailabilityText(consultantProfile.availability_status)}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-600">Available Hours/Week</h3>
                  <p className="text-base text-gray-800">
                    {consultantProfile.available_hours_per_week} hours
                  </p>
                </div>
              </div>
            </section>
            
            {/* Overview */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Professional Overview</h2>
              {consultantProfile.overview_markdown ? (
                <div className="prose prose-sm max-w-none text-gray-700">
                  {/* In a real app, we'd use a markdown renderer here */}
                  <p>{consultantProfile.overview_markdown}</p>
                </div>
              ) : (
                <p className="text-gray-500 italic">
                  No overview provided yet.
                </p>
              )}
            </section>
            
            {/* Skills Section */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">SAP Skills</h2>
              {skills.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {skills.map((skill) => (
                    <SkillBadge 
                      key={skill.id} 
                      skill={skill} 
                      yearsExperience={skill.years_experience} 
                      proficiencyLevel={skill.proficiency_level}
                      isPrimary={skill.is_primary}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">
                  No skills specified yet.
                </p>
              )}
            </section>
            
            {/* Certifications Section */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Certifications</h2>
              {certifications.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {certifications.map((cert) => (
                    <CertificationBadge 
                      key={cert.id} 
                      certification={(cert.certifications || cert) as { id: string; name: string; code: string | null; issuing_authority: string }} 
                      consultantCertification={cert}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">
                  No certifications specified yet.
                </p>
              )}
            </section>
            
            {/* Portfolio Section */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Portfolio & Projects</h2>
              {portfolioItems.length > 0 ? (
                <div className="grid gap-4">
                  {portfolioItems.map((item) => (
                    <PortfolioItem 
                      key={item.id} 
                      portfolio={item} 
                      showDetails={true} 
                    />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">
                  No portfolio items added yet.
                </p>
              )}
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

// Helper function to get availability text
function getAvailabilityText(status: string): string {
  switch (status) {
    case 'available': return 'Available for new projects';
    case 'partially_available': return 'Partially available (limited hours)';
    case 'busy': return 'Currently busy';
    case 'unavailable': return 'Not available for work';
    default: return 'Availability not specified';
  }
}
