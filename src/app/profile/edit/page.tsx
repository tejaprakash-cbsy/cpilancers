'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export default function EditProfilePage() {
  return <><Header /><main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-2xl font-bold">Edit profile</h1><p className="mt-3 text-gray-600">Profile editing is available after your account role and profile are loaded.</p><Link className="mt-6 inline-block rounded bg-gray-200 px-4 py-2" href="/profile">Back to profile</Link></main><Footer /></>;
}
