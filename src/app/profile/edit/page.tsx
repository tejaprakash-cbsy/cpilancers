'use client';

import Link from 'next/link';
import { ArrowLeft, CircleHelp, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function EditProfilePage() {
  return <main className="min-h-screen bg-[#f5f6f8]"><div className="mx-auto max-w-[900px] px-6 py-9 sm:px-10"><Link href="/profile" className="flex items-center gap-2 text-xs text-[#667085] hover:text-[#365cf5]"><ArrowLeft className="h-4 w-4" /> Back to profile</Link><div className="mt-7"><p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">Profile settings</p><h1 className="mt-2 text-[30px] font-normal">Edit profile</h1><p className="mt-2 text-sm text-[#667085]">Update the information clients and consultants see on Lancers.</p></div><Card className="mt-7 p-7"><div className="flex items-start gap-4"><span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#eef1ff] text-[#365cf5]"><LockKeyhole className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold">Profile editing is being prepared</h2><p className="mt-2 text-sm leading-6 text-[#667085]">Profile editing becomes available after your account role and profile are loaded. Your existing profile data remains unchanged.</p><Link href="/profile"><Button variant="outline" className="mt-5">Return to profile</Button></Link></div></div></Card><div className="mt-5 flex items-center gap-2 text-xs text-[#667085]"><CircleHelp className="h-4 w-4" /> Need help with your account? Contact support.</div></div></main>;
}
