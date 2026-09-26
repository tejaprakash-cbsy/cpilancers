'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export default function CreateJobPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    title: '', description_markdown: '', deliverables_markdown: '',
    integration_type: 'p2p', source_systems: 'SAP S/4HANA', target_systems: 'SAP Integration Suite',
    protocols: 'REST', estimated_duration_weeks: '4', budget_type: 'fixed_price', budget_fixed_cents: '10000',
  });

  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('');
    const payload = { ...form, source_systems: form.source_systems.split(',').map((v) => v.trim()).filter(Boolean), target_systems: form.target_systems.split(',').map((v) => v.trim()).filter(Boolean), protocols: form.protocols.split(',').map((v) => v.trim()).filter(Boolean), estimated_duration_weeks: Number(form.estimated_duration_weeks), budget_fixed_cents: Number(form.budget_fixed_cents) };
    const response = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    setPending(false);
    if (!response.ok) { setError(result.error?.message || 'Unable to create job.'); return; }
    router.push(`/jobs/${result.data.id}`);
  }

  return <><Header /><main className="mx-auto max-w-3xl px-6 py-10"><h1 className="mb-6 text-2xl font-bold">Create SAP integration job</h1>{error && <p className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}<form onSubmit={submit} className="space-y-4">
    {([['title','Title'],['description_markdown','Description'],['deliverables_markdown','Deliverables'],['source_systems','Source systems'],['target_systems','Target systems'],['protocols','Protocols']] as const).map(([name,label]) => <label key={name} className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{name === 'title' ? <input required className="w-full rounded border p-2" value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /> : <textarea required className="w-full rounded border p-2" rows={name === 'description_markdown' ? 5 : 2} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} />}</label>)}
    <label className="block"><span className="mb-1 block text-sm font-medium">Integration type</span><select className="w-full rounded border p-2" value={form.integration_type} onChange={(e) => setForm({ ...form, integration_type: e.target.value })}><option value="p2p">P2P</option><option value="a2a">A2A</option><option value="b2b">B2B</option><option value="batch">Batch</option><option value="realtime">Realtime</option><option value="event_driven">Event-driven</option><option value="hybrid">Hybrid</option></select></label>
    <div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1 block text-sm font-medium">Duration (weeks)</span><input type="number" min="1" max="52" required className="w-full rounded border p-2" value={form.estimated_duration_weeks} onChange={(e) => setForm({ ...form, estimated_duration_weeks: e.target.value })} /></label><label><span className="mb-1 block text-sm font-medium">Fixed budget (cents)</span><input type="number" min="100" required className="w-full rounded border p-2" value={form.budget_fixed_cents} onChange={(e) => setForm({ ...form, budget_fixed_cents: e.target.value })} /></label></div>
    <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{pending ? 'Creating…' : 'Create draft'}</button>
  </form></main><Footer /></>;
}
