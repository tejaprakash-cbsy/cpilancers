'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export default function ProfilePage() {
  return <><Header /><main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-2xl font-bold">Your profile</h1><p className="mt-3 text-gray-600">Manage your marketplace profile and account details.</p><Link className="mt-6 inline-block rounded bg-blue-600 px-4 py-2 text-white" href="/profile/edit">Edit profile</Link></main><Footer /></>;
}
