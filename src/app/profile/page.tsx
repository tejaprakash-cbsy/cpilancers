'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, MapPin, Pencil, ShieldCheck, Star } from 'lucide-react';
import { ClientProfileService as ProfileService } from '@/services/client-api.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type ProfileData = Awaited<ReturnType<typeof ProfileService.getProfile>>;

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ProfileService.getProfile().then(setData).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to load profile')).finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8]"><div className="h-10 w-10 animate-spin rounded-full border-2 border-[#dde1e7] border-t-[#365cf5]" /></main>;
  if (error || !data) return <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] p-6"><Card className="max-w-md p-6 text-center"><p className="text-sm text-[#b42318]">{error || 'Profile not found'}</p><Link href="/register"><Button className="mt-4">Create a profile</Button></Link></Card></main>;

  const name = data.profile.display_name || `${data.profile.first_name} ${data.profile.last_name}`;
  const isConsultant = Boolean(data.consultantProfile);

  return <main className="bg-[#f5f6f8]"><div className="mx-auto max-w-[1100px] px-6 py-9 sm:px-10">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Account</p><h1 className="mt-2 text-[30px] font-normal">Your profile</h1><p className="mt-2 text-sm text-[#667085]">Keep your marketplace identity clear, credible, and current.</p></div><Link href="/profile/edit"><Button><Pencil className="mr-2 h-4 w-4" /> Edit profile</Button></Link></div>
    <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_300px]"><div className="space-y-5">
      <Card className="p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-start"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#eef1ff] text-xl font-bold text-[#365cf5]">{name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="text-2xl font-normal">{name}</h2><BadgeCheck className="h-5 w-5 text-[#365cf5]" /></div><p className="mt-2 text-sm text-[#667085]">{isConsultant ? data.consultantProfile?.professional_headline : data.clientProfile?.job_title || 'Marketplace member'}</p><p className="mt-2 flex items-center gap-2 text-xs text-[#667085]"><MapPin className="h-3.5 w-3.5" /> {data.profile.city || 'Remote'} · {data.profile.country_code || 'Worldwide'}</p></div><Badge variant={isConsultant ? 'success' : 'sap'}>{isConsultant ? 'Consultant' : 'Client'}</Badge></div><div className="mt-7 grid grid-cols-2 gap-5 border-t border-[#dde1e7] pt-5 sm:grid-cols-4"><Metric value={isConsultant ? (data.consultantProfile?.years_sap_experience != null ? `${data.consultantProfile.years_sap_experience}+` : '—') : '—'} label="Years experience" /><Metric value={isConsultant ? (data.consultantProfile?.completed_contracts_count != null ? `${data.consultantProfile.completed_contracts_count}` : '—') : '—'} label="Completed projects" /><Metric value={isConsultant ? data.consultantProfile?.avg_rating?.toFixed(1) || '—' : '—'} label="Average rating" /><Metric value={data.profile.timezone || 'UTC'} label="Timezone" /></div></Card>
      <Card className="p-7"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">About you</h2><Link href="/profile/edit" className="text-xs font-semibold text-[#365cf5]">Edit</Link></div><p className="mt-5 text-sm leading-6 text-[#667085]">{data.profile.bio_summary || (isConsultant ? data.consultantProfile?.overview_markdown : '') || 'No profile summary added yet.'}</p></Card>
      {isConsultant && <Card className="p-7"><h2 className="text-lg font-medium">Skills & expertise</h2><div className="mt-5 flex flex-wrap gap-2">{data.skills.length ? data.skills.map((item) => <Badge key={item.skill.name} variant="default">{item.skill.name}</Badge>) : <span className="text-sm text-[#667085]">No skills added yet.</span>}</div></Card>}
    </div><aside className="space-y-5"><Card className="p-6"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Profile strength</h2><span className="text-lg text-[#365cf5]">{isConsultant ? (data.consultantProfile?.profile_score != null ? `${data.consultantProfile.profile_score}%` : '—') : '—'}</span></div><div className="mt-4 h-2 rounded-full bg-[#eef1ff]"><div className="h-2 rounded-full bg-[#365cf5]" style={{ width: `${isConsultant ? data.consultantProfile?.profile_score ?? 0 : 0}%` }} /></div><p className="mt-4 text-xs leading-5 text-[#667085]">Complete your profile to help clients make confident decisions.</p><Link href="/profile/edit" className="mt-4 block text-xs font-semibold text-[#365cf5]">Complete profile</Link></Card><Card className="p-6"><h2 className="text-sm font-semibold">Trust and safety</h2><div className="mt-4 space-y-3 text-xs text-[#667085]"><p className="flex gap-2"><ShieldCheck className="h-4 w-4 text-[#148267]" /> Identity and account protected</p><p className="flex gap-2"><Star className="h-4 w-4 text-[#f6b44b]" /> Reviews build credibility</p></div></Card></aside></div>
  </div></main>;
}

function Metric({ value, label }: { value: string; label: string }) { return <div><strong className="block text-sm font-normal">{value}</strong><span className="mt-1 block text-[10px] text-[#667085]">{label}</span></div>; }
