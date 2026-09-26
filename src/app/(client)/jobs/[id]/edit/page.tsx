'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const [form, setForm] = useState({ title: '', description_markdown: '', deliverables_markdown: '', estimated_duration_weeks: '4', budget_fixed_cents: '10000' });
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  useEffect(() => { fetch(`/api/jobs/${id}`).then((r) => r.json()).then((r) => { if (!r.data) setError(r.error?.message || 'Unable to load job.'); else setForm({ title: r.data.title, description_markdown: r.data.description_markdown, deliverables_markdown: r.data.deliverables_markdown, estimated_duration_weeks: String(r.data.estimated_duration_weeks), budget_fixed_cents: String(r.data.budget_fixed_cents || '') }); }).catch(() => setError('Unable to load job.')); }, [id]);
  async function submit(event: FormEvent) { event.preventDefault(); setPending(true); const response = await fetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, estimated_duration_weeks: Number(form.estimated_duration_weeks), budget_fixed_cents: Number(form.budget_fixed_cents) }) }); const result = await response.json(); setPending(false); if (!response.ok) { setError(result.error?.message || 'Unable to update job.'); return; } router.push(`/jobs/${id}`); }
  return <><Header /><main className="mx-auto max-w-3xl px-6 py-10"><h1 className="mb-6 text-2xl font-bold">Edit job</h1>{error && <p className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}<form onSubmit={submit} className="space-y-4">{(['title','description_markdown','deliverables_markdown'] as const).map((name) => <label key={name} className="block"><span className="mb-1 block text-sm font-medium">{name.replaceAll('_',' ')}</span>{name === 'title' ? <input required className="w-full rounded border p-2" value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /> : <textarea required className="w-full rounded border p-2" rows={5} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} />}</label>)}<div className="grid gap-4 sm:grid-cols-2"><input type="number" min="1" max="52" required className="rounded border p-2" value={form.estimated_duration_weeks} onChange={(e) => setForm({ ...form, estimated_duration_weeks: e.target.value })} /><input type="number" min="100" required className="rounded border p-2" value={form.budget_fixed_cents} onChange={(e) => setForm({ ...form, budget_fixed_cents: e.target.value })} /></div><button disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-white">{pending ? 'Saving…' : 'Save changes'}</button></form></main><Footer /></>;
}
