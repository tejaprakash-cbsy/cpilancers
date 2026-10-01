'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, CheckCircle2, Clock3, MessageCircle } from 'lucide-react';
import { ClientProfileService as ProfileService } from '@/services/client-api.service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { ConsultantProfile, Profile } from '@/types/database';
import { SkillBadge, type SkillBadgeSkill } from '@/components/profiles/skill-badge';
import { CertificationBadge } from '@/components/profiles/certification-badge';
import { PortfolioItem, type PortfolioItemData } from '@/components/profiles/portfolio-item';

type Skill = SkillBadgeSkill & { years_experience?: number; proficiency_level?: string; is_primary?: boolean };
type Certification = { id: string; verification_status: string; credential_id: string | null; issue_date: string; expiry_date: string | null; certifications?: { id: string; name: string; code: string | null; issuing_authority: string } };

export default function ConsultantPublicProfilePage() {
  const { id } = useParams(); const router = useRouter(); const [profile, setProfile] = useState<Profile | null>(null); const [consultant, setConsultant] = useState<ConsultantProfile | null>(null); const [skills, setSkills] = useState<Skill[]>([]); const [certifications, setCertifications] = useState<Certification[]>([]); const [portfolio, setPortfolio] = useState<PortfolioItemData[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  /**
   * Load the public consultant profile.
   *
   * `shouldApply` is the cancelled-flag guard, checked BEFORE every state write,
   * so navigating between two consultants cannot render the first one's data
   * under the second one's URL when responses land out of order.
   */
  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      try {
        const data = await ProfileService.getConsultantProfileById(id as string);
        if (!shouldApply()) return;
        if (!data || !data.profile) {
          setError('Consultant not found');
          return;
        }
        setProfile(data.profile);
        setConsultant(data.consultant);
        setSkills(data.skills as Skill[]);
        setCertifications(data.certifications as Certification[]);
        setPortfolio(data.portfolios as PortfolioItemData[]);
      } catch (err: unknown) {
        if (!shouldApply()) return;
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    let cancelled = false;
    const shouldApply = () => !cancelled;
    void (async () => {
      await load(shouldApply);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8]"><div className="h-10 w-10 animate-spin rounded-full border-2 border-[#dde1e7] border-t-[#365cf5]" /></main>;
  if (error || !profile || !consultant) return <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] p-6"><Card className="max-w-md p-6 text-center"><h1 className="text-lg font-semibold">{error || 'Profile not found'}</h1><Button className="mt-5" onClick={() => router.push('/')}>Go home</Button></Card></main>;
  const name = profile.display_name || `${profile.first_name} ${profile.last_name}`;

  // Fabricated-data guard.
  //
  // This page previously rendered invented content that looked authoritative and
  // was not backed by any row: a fixed "20-30 hours/week", a fixed
  // "Available from Oct 5", an unconditional "Identity verified", three named
  // past employers with fixed 5.0/5.0/4.8 ratings, "4.9" and "128 reviews" as
  // fallbacks for a consultant who may have no ratings at all, a hardcoded
  // "BFA, Interaction Design / Parsons School of Design / 2015" education
  // entry, and an "Available" badge regardless of `availability_status`.
  //
  // Every value below now comes from the fetched row, or renders an honest
  // empty state. There is no `reviews` table join available on this endpoint,
  // so the review summary is derived only from the real aggregate columns and
  // states plainly when there are none.
  const hasReviews = (consultant.total_reviews_count ?? 0) > 0;
  const availabilityLabel =
    consultant.availability_status === 'available'
      ? 'Available now'
      : consultant.availability_status === 'partially_available'
        ? 'Partially available'
        : consultant.availability_status === 'busy'
          ? 'Currently busy'
          : consultant.availability_status === 'unavailable'
            ? 'Not currently available'
            : 'Availability not specified';
  return <main className="bg-[#f5f6f8]"><div className="mx-auto max-w-[1280px] px-6 py-8 sm:px-10"><div className="mb-5 text-[11px] text-[#667085]">Freelancers <span className="mx-2">/</span> {name}</div><div className="grid gap-5 lg:grid-cols-[1fr_340px]"><div className="space-y-4"><Card className="p-7"><div className="flex flex-col gap-6 sm:flex-row sm:items-start"><div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#eef1ff] text-2xl font-semibold text-[#365cf5]">{name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="text-[28px] font-normal">{name}</h1></div><p className="mt-2 text-sm">{consultant.professional_headline}</p><p className="mt-2 text-[11px] text-[#667085]">{profile.city || 'Not specified'}{profile.country_code ? ` · ${profile.country_code}` : ''}</p></div><div className="text-left sm:text-right"><Badge variant={consultant.availability_status === 'available' ? 'success' : 'default'}>{consultant.availability_status === 'available' ? 'Available now' : 'Not specified'}</Badge></div></div><div className="mt-7 grid grid-cols-2 gap-5 border-t border-[#dde1e7] pt-5 sm:grid-cols-5"><Stat value={consultant.avg_rating?.toFixed(1) ?? '—'} label="Client rating" /><Stat value={`${consultant.completed_contracts_count ?? '—'}`} label="Completed projects" /><Stat value={consultant.hourly_rate_cents != null ? formatCurrency(consultant.hourly_rate_cents) : 'Not specified'} label="Hourly rate" /><Stat value={consultant.years_sap_experience != null ? `${consultant.years_sap_experience}+` : '—'} label="Experience" /></div></Card><Card className="p-7"><h2 className="text-lg font-medium">About</h2><p className="mt-5 whitespace-pre-line text-sm leading-6 text-[#667085]">{consultant.overview_markdown || 'This consultant has not added an overview yet.'}</p></Card><Card className="p-7"><h2 className="text-lg font-medium">Skills & expertise</h2><div className="mt-5 flex flex-wrap gap-2">{skills.length ? skills.map((skill) => <SkillBadge key={skill.id} skill={skill} yearsExperience={skill.years_experience} proficiencyLevel={skill.proficiency_level} isPrimary={skill.is_primary} />) : <span className="text-sm text-[#667085]">No skills listed.</span>}</div></Card><Card className="p-7"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Selected portfolio</h2><span className="text-[11px] text-[#365cf5]">View all projects</span></div><div className="mt-5 grid gap-4 sm:grid-cols-3">{portfolio.length ? portfolio.slice(0, 3).map((item) => <PortfolioItem key={item.id} portfolio={item} showDetails />) : <p className="text-sm text-[#667085]">No portfolio items yet.</p>}</div></Card><Card className="p-7"><h2 className="text-lg font-medium">Work history</h2><div className="mt-5 divide-y divide-[#dde1e7]">{hasReviews ? <p className="py-4 text-sm text-[#667085]">Work history is not recorded on this profile yet.</p> : <p className="py-4 text-sm text-[#667085]">No work history to show yet.</p>}</div></Card><Card className="p-7"><h2 className="text-lg font-medium">Client reviews</h2>{hasReviews ? <div className="mt-5 flex gap-8"><div><p className="text-4xl font-normal">{consultant.avg_rating?.toFixed(1) ?? '—'}</p><p className="mt-1 text-xs text-[#667085]">{consultant.total_reviews_count} review{consultant.total_reviews_count === 1 ? '' : 's'}</p></div></div> : <p className="mt-5 text-sm text-[#667085]">No client reviews yet.</p>}</Card><div className="grid gap-4 sm:grid-cols-2"><Card className="p-6"><h2 className="text-sm font-medium">Education</h2><p className="mt-5 text-xs text-[#667085]">Education details are not recorded on this profile.</p></Card><Card className="p-6"><h2 className="text-sm font-medium">Certifications</h2>{certifications.length ? certifications.slice(0, 1).map((cert) => <div key={cert.id} className="mt-4"><CertificationBadge certification={(cert.certifications || cert) as { id: string; name: string; code: string | null; issuing_authority: string }} consultantCertification={cert} /></div>) : <p className="mt-5 text-xs text-[#667085]">No certifications listed.</p>}</Card></div></div><aside className="space-y-4"><Card className="p-6"><div className="flex items-start justify-between"><div><p className="text-[11px] text-[#667085]">Hourly rate</p><p className="mt-1 text-2xl">${(consultant.hourly_rate_cents / 100).toFixed(0)}/hr</p></div><Badge variant={consultant.availability_status === 'available' ? 'success' : 'default'}>{availabilityLabel}</Badge></div><Button className="mt-5 w-full" onClick={() => router.push('/register')}><MessageCircle className="mr-2 h-4 w-4" /> Hire {name.split(' ')[0]}</Button><Button variant="outline" className="mt-2 w-full" onClick={() => router.push('/register')}>Contact</Button><button className="mt-4 w-full text-center text-[11px] text-[#667085]">♡ Save to shortlist</button><div className="mt-5 space-y-3 border-t border-[#dde1e7] pt-5 text-xs text-[#667085]"><p className="flex gap-2"><Clock3 className="h-3.5 w-3.5" /> {consultant.available_hours_per_week != null ? `${consultant.available_hours_per_week} hours/week` : 'Hours not specified'}</p><p className="flex gap-2"><Calendar className="h-3.5 w-3.5" /> {consultant.availability_status === 'available' ? 'Available now' : consultant.availability_status === 'partially_available' ? 'Partially available' : consultant.availability_status === 'busy' ? 'Currently busy' : 'Not currently available'}</p></div></Card><div className="rounded-[12px] bg-[#eef1ff] p-5 text-xs text-[#2445c7]"><Shield className="h-4 w-4" /><p className="mt-2">Lancers Protection keeps payments and communication on-platform.</p></div></aside></div></div></main>;
}

function Stat({ value, label }: { value: string; label: string }) { return <div><strong className="block text-sm font-normal">{value}</strong><span className="mt-1 block text-[10px] text-[#667085]">{label}</span></div>; }
function Shield({ className }: { className?: string }) { return <CheckCircle2 className={className} />; }
