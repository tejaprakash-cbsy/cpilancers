'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LifeBuoy,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { resetPasswordSchema } from '@/lib/validations/auth.schemas';
import type { Profile, User } from '@/types/database';

type PreferenceMatrix = Record<string, Record<string, boolean | 'locked'>>;

const NOTIFICATION_LABELS: Record<string, string> = {
  proposal_received: 'Proposal received',
  proposal_shortlisted: 'Proposal shortlisted',
  proposal_accepted: 'Proposal accepted',
  contract_created: 'Contract created',
  contract_accepted: 'Contract accepted',
  milestone_submitted: 'Milestone submitted',
  milestone_approved: 'Milestone approved',
  milestone_revision: 'Milestone revision requested',
  payment_escrowed: 'Payment escrowed',
  payment_released: 'Payment released',
  message_received: 'New direct message',
  review_submitted: 'New review submitted',
  dispute_opened: 'Dispute opened',
  dispute_resolved: 'Dispute resolved',
  system_alert: 'System & security alerts',
};

function formatRoleLabel(role?: User['role'] | null): string {
  if (role === 'client') return 'Enterprise Client';
  if (role === 'admin') return 'Administrator';
  return 'SAP Consultant';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CP';
  return parts
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [preferences, setPreferences] = React.useState<PreferenceMatrix>({});
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Password form state
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = React.useState(false);

  // Notification toggle state
  const [savingPrefKey, setSavingPrefKey] = React.useState<string | null>(null);
  const [prefMessage, setPrefMessage] = React.useState<string | null>(null);
  const [prefError, setPrefError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [meRes, profileRes, prefsRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/profile'),
          fetch('/api/notification-preferences'),
        ]);

        if (meRes.status === 401) {
          router.push('/login');
          return;
        }

        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.data) {
          throw new Error(meJson.error?.message || 'Unable to load account');
        }

        if (cancelled) return;
        setUser(meJson.data as User);

        if (profileRes.ok) {
          const profileJson = await profileRes.json();
          if (!cancelled && profileJson.data?.profile) {
            setProfile(profileJson.data.profile as Profile);
          }
        }

        if (prefsRes.ok) {
          const prefsJson = await prefsRes.json();
          if (!cancelled && prefsJson.data?.preferences) {
            setPreferences(prefsJson.data.preferences as PreferenceMatrix);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Unable to load settings'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    const parsed = resetPasswordSchema.safeParse({
      password: newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      setPasswordError(
        parsed.error.issues[0]?.message || 'Please enter a valid password.'
      );
      return;
    }

    setUpdatingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: newPassword, confirmPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update password');
      }
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated successfully.');
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : 'Failed to update password'
      );
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleTogglePreference = async (
    type: string,
    channel: string,
    current: boolean | 'locked'
  ) => {
    if (current === 'locked') return;
    const key = `${type}:${channel}`;
    const nextEnabled = !current;
    setSavingPrefKey(key);
    setPrefError(null);
    setPrefMessage(null);

    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, channel, enabled: nextEnabled }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update preference');
      }
      setPreferences((prev) => ({
        ...prev,
        [type]: {
          ...(prev[type] || {}),
          [channel]: nextEnabled,
        },
      }));
      setPrefMessage('Preferences saved');
    } catch (err) {
      setPrefError(
        err instanceof Error ? err.message : 'Failed to update preference'
      );
    } finally {
      setSavingPrefKey(null);
    }
  };

  const accountName =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    user?.email ||
    'CPI Lancers Member';

  const passwordRules = [
    { label: 'At least 8 characters', met: newPassword.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(newPassword) },
    { label: 'One lowercase letter', met: /[a-z]/.test(newPassword) },
    { label: 'One number', met: /[0-9]/.test(newPassword) },
  ];

  const preferenceEntries = Object.entries(preferences);

  return (
    <DashboardShell
      accountName={accountName}
      accountEmail={user?.email}
      roleLabel={formatRoleLabel(user?.role)}
      initials={getInitials(accountName)}
      role={user?.role}
    >
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">
            Account
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Account Settings
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Manage your email verification status, password security, and notification preferences.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 space-y-5">
            <Card className="border-slate-200/80 bg-white p-6">
              <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
              <div className="mt-4 h-20 animate-pulse rounded-lg bg-slate-100" />
            </Card>
          </div>
        ) : loadError ? (
          <Card className="mt-8 border-slate-200/80 bg-white p-6 text-center">
            <p className="text-sm font-medium text-rose-700">{loadError}</p>
          </Card>
        ) : (
          <div className="mt-7 space-y-6">
            {/* 1. Account Information */}
            <Card className="border-slate-200/80 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef1ff] text-[#365cf5]">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold tracking-tight text-slate-900">
                      Account Information
                    </h2>
                    <p className="text-xs text-slate-500">
                      Primary sign-in email and role on CPI Lancers.
                    </p>
                  </div>
                </div>
                <Link href="/profile/edit">
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  >
                    Edit Profile
                  </Button>
                </Link>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">Email Address</p>
                  <p className="mt-1 truncate text-sm font-medium text-slate-900">
                    {user?.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Verification Status</p>
                  <div className="mt-1">
                    <Badge variant={user?.is_email_verified ? 'success' : 'warning'}>
                      {user?.is_email_verified ? 'Verified' : 'Pending'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Account Role</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {formatRoleLabel(user?.role)}
                  </p>
                </div>
              </div>
            </Card>

            {/* 2. Password & Security */}
            <Card className="border-slate-200/80 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef1ff] text-[#365cf5]">
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold tracking-tight text-slate-900">
                      Password &amp; Security
                    </h2>
                    <p className="text-xs text-slate-500">
                      Update your account password or sign out of your current session.
                    </p>
                  </div>
                </div>
                <form action="/api/auth/logout" method="POST">
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    leftIcon={<LogOut className="h-3.5 w-3.5" />}
                  >
                    Sign out
                  </Button>
                </form>
              </div>

              <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
                {passwordError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700"
                  >
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {passwordSuccess}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="relative">
                    <Input
                      label="New Password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      label="Confirm Password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      aria-label={
                        showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                      }
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-slate-500">
                  {passwordRules.map((rule) => (
                    <span
                      key={rule.label}
                      className={`inline-flex items-center gap-1 ${
                        rule.met ? 'font-medium text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {rule.label}
                    </span>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={updatingPassword}>
                    {updatingPassword ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Updating...
                      </span>
                    ) : (
                      'Update password'
                    )}
                  </Button>
                </div>
              </form>
            </Card>

            {/* 3. Notification Preferences */}
            <Card
              id="notifications"
              className="scroll-mt-24 border-slate-200/80 bg-white p-6 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef1ff] text-[#365cf5]">
                    <Bell className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold tracking-tight text-slate-900">
                      Notification Preferences
                    </h2>
                    <p className="text-xs text-slate-500">
                      Choose which events send in-app alerts or email notifications.
                    </p>
                  </div>
                </div>
                {prefMessage && (
                  <span className="text-xs font-medium text-emerald-700">
                    {prefMessage}
                  </span>
                )}
              </div>

              {prefError && (
                <p className="mt-3 text-xs text-rose-600">{prefError}</p>
              )}

              {preferenceEntries.length > 0 ? (
                <div className="mt-4 divide-y divide-slate-100">
                  {preferenceEntries.map(([type, channels]) => (
                    <div
                      key={type}
                      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm font-medium text-slate-800">
                        {NOTIFICATION_LABELS[type] || type.replace(/_/g, ' ')}
                      </span>
                      <div className="flex flex-wrap items-center gap-4">
                        {Object.entries(channels).map(([channel, state]) => {
                          const key = `${type}:${channel}`;
                          const isLocked = state === 'locked';
                          const checked = isLocked ? true : Boolean(state);
                          const isBusy = savingPrefKey === key;

                          return (
                            <label
                              key={channel}
                              className="flex items-center gap-2 text-xs text-slate-600"
                            >
                              <span className="capitalize">
                                {channel.replace(/_/g, ' ')}
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={checked}
                                aria-label={`${NOTIFICATION_LABELS[type] || type} ${channel}`}
                                disabled={isLocked || isBusy}
                                onClick={() =>
                                  handleTogglePreference(type, channel, state)
                                }
                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365cf5]/40 ${
                                  isLocked
                                    ? 'cursor-not-allowed bg-slate-300'
                                    : checked
                                      ? 'bg-[#365cf5]'
                                      : 'bg-slate-200'
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                    checked ? 'translate-x-4' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                              {isLocked && (
                                <span className="text-[10px] text-slate-400">
                                  Required
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-500">
                  Notification preferences are managed automatically for your account.
                </p>
              )}
            </Card>

            {/* 4. Account Status & Support */}
            <Card className="border-slate-200/80 bg-[#f4f6fb] p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#365cf5] shadow-xs">
                  <LifeBuoy className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Account Deactivation &amp; Data Export
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    To request account deactivation or a copy of your CPI Lancers profile and contract records, email{' '}
                    <a
                      href="mailto:support@cpilancers.com"
                      className="font-medium text-[#365cf5] hover:underline"
                    >
                      support@cpilancers.com
                    </a>{' '}
                    or reach us through the{' '}
                    <Link
                      href="/contact"
                      className="font-medium text-[#365cf5] hover:underline"
                    >
                      support page
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
