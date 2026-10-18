'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BarChart3, FileWarning, Users, WalletCards } from 'lucide-react';
import { DashboardShell, type DashboardNavItem } from '@/components/layout/dashboard-shell';

type ApiState = {
  overview: Record<string, unknown> | null;
  failed: { payments: PaginatedRows; payouts: PaginatedRows } | null;
  disputes: PaginatedRows | null;
  reports: PaginatedRows | null;
  loading: boolean;
  error: string | null;
};

type AdminRow = Record<string, unknown>;
type PaginatedRows = { rows: AdminRow[]; total: number; page: number; limit: number };
type FailedTransactions = { payments: PaginatedRows; payouts: PaginatedRows };

const navItems: DashboardNavItem[] = [
  { label: 'Overview', href: '/admin', icon: BarChart3 },
  { label: 'Failed transactions', href: '/admin#transactions', icon: WalletCards },
  { label: 'Disputes', href: '/admin#disputes', icon: AlertTriangle },
  { label: 'Reports', href: '/admin#reports', icon: FileWarning },
];

async function readApi<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include' });
  const body = await response.json() as { data?: unknown; error?: { message?: string } };
  if (!response.ok) {
    const error = new Error(body.error?.message || 'Unable to load admin data.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body.data as T;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<ApiState>({ overview: null, failed: null, disputes: null, reports: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      readApi<Record<string, unknown>>('/api/admin/overview'),
      readApi<FailedTransactions>('/api/admin/payments?failed=1&page=1&limit=10'),
      readApi<PaginatedRows>('/api/admin/disputes?page=1&limit=5'),
      readApi<PaginatedRows>('/api/admin/reports?page=1&limit=5&status=pending'),
    ]).then(([overview, failed, disputes, reports]) => {
      if (!cancelled) setState({ overview, failed, disputes, reports, loading: false, error: null });
    }).catch((error: unknown) => {
      if (error instanceof Error && (error as Error & { status?: number }).status === 401) {
        router.replace('/login?next=%2Fadmin');
        return;
      }
      if (!cancelled) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Unable to load admin data.' }));
    });
    return () => { cancelled = true; };
  }, [router]);

  const metric = (key: string) => String(state.overview?.[key] ?? '—');
  return <DashboardShell accountName="CPI Lancers" roleLabel="Administrator" initials="AD" navItems={navItems} footerItems={[]} searchPlaceholder="Search the admin workspace">
    <div className="p-5 sm:p-8">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h1 className="text-[28px] font-normal">Admin overview</h1><p className="mt-1 text-sm text-[#667085]">Review marketplace health, risk queues, and failed money movement.</p></div><span className="rounded-full bg-[#eef1ff] px-3 py-1 text-xs font-medium text-[#2445c7]">Local admin surface</span></div>
      {state.loading && <div className="mt-8 h-32 animate-pulse rounded-xl bg-white" />}
      {state.error && <div className="mt-5 rounded-[10px] border border-[#f4c7c3] bg-[#fef0ef] p-4 text-sm text-[#b42318]">{state.error}</div>}
      {!state.loading && !state.error && <>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Users" value={metric('registered_users')} icon={Users} /><Metric label="Open jobs" value={metric('open_jobs')} icon={BarChart3} /><Metric label="Open disputes" value={metric('open_disputes')} icon={AlertTriangle} /><Metric label="Pending reports" value={metric('pending_reports')} icon={FileWarning} /></div>
        <div id="transactions" className="mt-6 grid gap-5 xl:grid-cols-2"><Panel title="Failed payments" total={state.failed?.payments?.total}><Rows rows={state.failed?.payments?.rows} empty="No failed payments." /></Panel><Panel title="Failed payouts" total={state.failed?.payouts?.total}><Rows rows={state.failed?.payouts?.rows} empty="No failed payouts." /></Panel></div>
        <div className="mt-5 grid gap-5 xl:grid-cols-2"><Panel title="Dispute queue" total={state.disputes?.total} id="disputes"><Rows rows={state.disputes?.rows} empty="No open disputes." /></Panel><Panel title="Pending reports" total={state.reports?.total} id="reports"><Rows rows={state.reports?.rows} empty="No pending reports." /></Panel></div>
      </>}
    </div>
  </DashboardShell>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) { return <div className="rounded-xl border border-[#e5e7eb] bg-white p-5"><Icon className="h-5 w-5 text-[#365cf5]" /><p className="mt-4 text-sm text-[#667085]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
function Panel({ title, total, id, children }: { title: string; total?: number; id?: string; children: React.ReactNode }) { return <section id={id} className="rounded-xl border border-[#e5e7eb] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-medium">{title}</h2><span className="text-xs text-[#667085]">{total ?? 0} total</span></div><div className="mt-4">{children}</div></section>; }
function Rows({ rows, empty }: { rows?: AdminRow[]; empty: string }) {
  if (!rows?.length) return <p className="text-sm text-[#667085]">{empty}</p>;
  return <ul className="space-y-2">{rows.slice(0, 5).map((row, index) => <li key={index} className="truncate rounded-lg bg-[#f5f6f8] px-3 py-2 text-xs text-[#344054]">{summarizeRow(row)}</li>)}</ul>;
}

function summarizeRow(row: AdminRow): string {
  const status = typeof row.status === 'string' ? row.status : null;
  const reason = typeof row.reason === 'string' ? row.reason : null;
  const targetType = typeof row.target_type === 'string' ? row.target_type : null;
  const amount = typeof row.amount_cents === 'number' || typeof row.amount_cents === 'string' ? `${row.amount_cents} cents` : null;
  return [targetType, reason, amount, status].filter(Boolean).join(' · ') || 'Record available';
}
