import * as React from 'react';
import { ArrowRight, BarChart3, Inbox, MessageSquare, Plus, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function DashboardMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: React.ComponentType<{ className?: string }> }) {
  return <Card className="flex min-h-[132px] flex-col justify-between p-5"><div className="flex items-center justify-between"><span className="text-xs text-[#667085]">{label}</span><span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#eef1ff] text-[#365cf5]"><Icon className="h-4 w-4" /></span></div><strong className="text-2xl font-normal text-[#172033]">{value}</strong><span className="text-[10px] font-semibold text-[#667085]">{detail}</span></Card>;
}

export function DashboardPanel({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <Card className={`p-5 ${className}`}><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-[16px] font-medium text-[#172033]">{title}</h2>{action}</div>{children}</Card>;
}

export function UnavailablePanel({ title, detail }: { title: string; detail: string }) {
  return <DashboardPanel title={title}><div className="flex min-h-[100px] flex-col items-center justify-center text-center"><BarChart3 className="h-6 w-6 text-[#98a2b3]" /><p className="mt-3 text-xs font-medium text-[#667085]">Unavailable</p><p className="mt-1 max-w-sm text-[10px] leading-4 text-[#98a2b3]">{detail}</p></div></DashboardPanel>;
}

export function EmptyDashboardPanel({ title, detail, href, action }: { title: string; detail: string; href?: string; action?: string }) {
  return <div className="flex min-h-[140px] flex-col items-center justify-center rounded-[10px] border border-dashed border-[#c7ced9] p-5 text-center"><Inbox className="h-6 w-6 text-[#98a2b3]" /><p className="mt-3 text-xs font-medium text-[#667085]">{title}</p><p className="mt-1 max-w-sm text-[10px] leading-4 text-[#98a2b3]">{detail}</p>{href && action && <Link href={href} className="mt-4"><Button size="sm" variant="outline"><Plus className="mr-1 h-3.5 w-3.5" />{action}</Button></Link>}</div>;
}

export function MessagePreview({ name, detail, time }: { name: string; detail: string; time?: string }) {
  return <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef1ff] text-[10px] font-bold text-[#365cf5]">{name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#172033]">{name}</p><p className="truncate text-[10px] text-[#667085]">{detail}</p></div>{time && <span className="text-[10px] text-[#98a2b3]">{time}</span>}</div>;
}

export function DashboardLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="flex items-center gap-1 text-[10px] font-semibold text-[#365cf5]">{children}<ArrowRight className="h-3 w-3" /></Link>; }
export { MessageSquare, WalletCards, BarChart3, Plus, Badge };
