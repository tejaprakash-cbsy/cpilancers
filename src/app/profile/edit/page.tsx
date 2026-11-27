'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  clientProfileSchema,
  companyProfileSchema,
  consultantProfileSchema,
  profileSchema,
} from '@/lib/validations/profile.schemas';
import type {
  AvailabilityStatus,
  ClientProfile,
  Company,
  CompanySizeTier,
  ConsultantProfile,
  ConsultantSkill,
  Profile,
  ProficiencyLevel,
  Skill,
  User,
} from '@/types/database';

interface ProfileBundleResponse {
  profile: Profile | null;
  consultantProfile: ConsultantProfile | null;
  clientProfile: ClientProfile | null;
  company: Company | null;
  skills: Array<ConsultantSkill & { skill: Skill }>;
}

const INDIAN_HUB_CITIES = [
  'Bengaluru',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Mumbai',
  'Delhi NCR',
  'Kolkata',
  'Remote',
];

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'IST (UTC+5:30) · Asia/Kolkata' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Berlin', label: 'CET · Europe/Berlin' },
  { value: 'Europe/London', label: 'GMT/BST · Europe/London' },
  { value: 'Asia/Singapore', label: 'SGT · Asia/Singapore' },
  { value: 'America/New_York', label: 'EST/EDT · America/New_York' },
];

const AVAILABILITY_OPTIONS: Array<{ value: AvailabilityStatus; label: string }> = [
  { value: 'available', label: 'Available now' },
  { value: 'partially_available', label: 'Partially available' },
  { value: 'busy', label: 'Busy' },
  { value: 'unavailable', label: 'Unavailable' },
];

const COMPANY_SIZE_OPTIONS: Array<{ value: CompanySizeTier; label: string }> = [
  { value: 'startup_1_10', label: 'Startup (1–10)' },
  { value: 'small_11_50', label: 'Small (11–50)' },
  { value: 'medium_51_200', label: 'Medium (51–200)' },
  { value: 'midmarket_201_1000', label: 'Mid-market (201–1,000)' },
  { value: 'enterprise_1000_plus', label: 'Enterprise (1,000+)' },
];

const PROFICIENCY_OPTIONS: Array<{ value: ProficiencyLevel; label: string }> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

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

export default function EditProfilePage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [bundle, setBundle] = React.useState<ProfileBundleResponse | null>(null);
  const [allSkills, setAllSkills] = React.useState<Skill[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Base profile state
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [city, setCity] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('IN');
  const [timezone, setTimezone] = React.useState('Asia/Kolkata');
  const [bioSummary, setBioSummary] = React.useState('');

  // Consultant state
  const [professionalHeadline, setProfessionalHeadline] = React.useState('');
  const [yearsSapExperience, setYearsSapExperience] = React.useState('3');
  const [yearsCpiExperience, setYearsCpiExperience] = React.useState('2');
  const [hourlyRateInr, setHourlyRateInr] = React.useState('2500');
  const [availabilityStatus, setAvailabilityStatus] =
    React.useState<AvailabilityStatus>('available');
  const [availableHoursPerWeek, setAvailableHoursPerWeek] = React.useState('40');
  const [linkedinProfileUrl, setLinkedinProfileUrl] = React.useState('');
  const [githubProfileUrl, setGithubProfileUrl] = React.useState('');
  const [overviewMarkdown, setOverviewMarkdown] = React.useState('');

  // Client & company state
  const [jobTitle, setJobTitle] = React.useState('');
  const [department, setDepartment] = React.useState('');
  const [billingEmail, setBillingEmail] = React.useState('');
  const [legalName, setLegalName] = React.useState('');
  const [brandName, setBrandName] = React.useState('');
  const [industry, setIndustry] = React.useState('');
  const [companySize, setCompanySize] =
    React.useState<CompanySizeTier>('medium_51_200');
  const [websiteUrl, setWebsiteUrl] = React.useState('');

  // Skills state
  const [consultantSkills, setConsultantSkills] = React.useState<
    Array<ConsultantSkill & { skill: Skill }>
  >([]);
  const [selectedSkillId, setSelectedSkillId] = React.useState('');
  const [skillProficiency, setSkillProficiency] =
    React.useState<ProficiencyLevel>('advanced');
  const [skillYears, setSkillYears] = React.useState('2');
  const [skillBusy, setSkillBusy] = React.useState(false);
  const [skillError, setSkillError] = React.useState<string | null>(null);

  // Submission state
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const loadData = React.useCallback(async (withSpinner = false) => {
    if (withSpinner) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const [meRes, profileRes, skillsRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/profile'),
        fetch('/api/profile/skills'),
      ]);

      if (meRes.status === 401 || profileRes.status === 401) {
        router.push('/login');
        return;
      }

      const meJson = await meRes.json();
      const profileJson = await profileRes.json();
      if (!meRes.ok || !meJson.data) {
        throw new Error(meJson.error?.message || 'Unable to load account');
      }
      if (!profileRes.ok || !profileJson.data) {
        throw new Error(profileJson.error?.message || 'Unable to load profile');
      }

      const loadedUser = meJson.data as User;
      const loadedBundle = profileJson.data as ProfileBundleResponse;

      setUser(loadedUser);
      setBundle(loadedBundle);
      setConsultantSkills(loadedBundle.skills || []);

      if (skillsRes.ok) {
        const skillsJson = await skillsRes.json();
        const available = (skillsJson.data || []) as Skill[];
        setAllSkills(available);
        if (available.length > 0) {
          setSelectedSkillId(available[0].id);
        }
      }

      const p = loadedBundle.profile;
      if (p) {
        setFirstName(p.first_name || '');
        setLastName(p.last_name || '');
        setDisplayName(p.display_name || '');
        setCity(p.city || '');
        setCountryCode(p.country_code || 'IN');
        setTimezone(
          p.timezone && p.timezone !== 'UTC' ? p.timezone : 'Asia/Kolkata'
        );
        setBioSummary(p.bio_summary || '');
      }

      const c = loadedBundle.consultantProfile;
      if (c) {
        setProfessionalHeadline(c.professional_headline || '');
        setYearsSapExperience(String(c.years_sap_experience ?? 0));
        setYearsCpiExperience(String(c.years_cpi_experience ?? 0));
        setHourlyRateInr(
          c.hourly_rate_cents ? String(Math.round(c.hourly_rate_cents / 100)) : '2500'
        );
        setAvailabilityStatus(c.availability_status || 'available');
        setAvailableHoursPerWeek(String(c.available_hours_per_week ?? 40));
        setLinkedinProfileUrl(c.linkedin_profile_url || '');
        setGithubProfileUrl(c.github_profile_url || '');
        setOverviewMarkdown(c.overview_markdown || '');
      }

      const cl = loadedBundle.clientProfile;
      if (cl) {
        setJobTitle(cl.job_title || '');
        setDepartment(cl.department || '');
        setBillingEmail(cl.billing_email || '');
      }

      const comp = loadedBundle.company;
      if (comp) {
        setLegalName(comp.legal_name || '');
        setBrandName(comp.brand_name || '');
        setIndustry(comp.industry || '');
        setCompanySize(comp.company_size || 'medium_51_200');
        setWebsiteUrl(comp.website_url || '');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) {
        await loadData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !bundle) return;

    setFieldErrors({});
    setSaveError(null);
    setSaveSuccess(null);

    const errors: Record<string, string> = {};

    const basePayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      displayName: displayName.trim(),
      city: city.trim() || null,
      countryCode: (countryCode.trim() || 'IN').toUpperCase(),
      timezone: timezone.trim() || 'Asia/Kolkata',
      bioSummary: bioSummary.trim() || null,
    };

    const baseParsed = profileSchema.safeParse(basePayload);
    if (!baseParsed.success) {
      for (const issue of baseParsed.error.issues) {
        const key = String(issue.path[0] || 'profile');
        if (!errors[key]) errors[key] = issue.message;
      }
    }

    let consultantPayload: Record<string, unknown> | undefined;
    let clientPayload: Record<string, unknown> | undefined;
    let companyPayload: Record<string, unknown> | undefined;

    if (user.role === 'consultant') {
      const rateRupees = Number(hourlyRateInr);
      const rawConsultant = {
        professionalHeadline: professionalHeadline.trim(),
        yearsSapExperience: Number(yearsSapExperience) || 0,
        yearsCpiExperience: Number(yearsCpiExperience) || 0,
        hourlyRateCents: Number.isFinite(rateRupees)
          ? Math.round(rateRupees * 100)
          : 0,
        minProjectSizeCents: bundle.consultantProfile?.min_project_size_cents ?? 0,
        availabilityStatus,
        availableHoursPerWeek: Number(availableHoursPerWeek) || 0,
        githubProfileUrl: githubProfileUrl.trim() || null,
        linkedinProfileUrl: linkedinProfileUrl.trim() || null,
        overviewMarkdown: overviewMarkdown.trim(),
      };
      const parsed = consultantProfileSchema.safeParse(rawConsultant);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] || 'consultant');
          if (!errors[key]) errors[key] = issue.message;
        }
      } else {
        consultantPayload = parsed.data;
      }
    } else if (user.role === 'client') {
      const rawClient = {
        jobTitle: jobTitle.trim(),
        department: department.trim() || null,
        billingEmail: billingEmail.trim() || null,
      };
      const rawCompany = {
        legalName: legalName.trim(),
        brandName: brandName.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        industry: industry.trim(),
        companySize,
        sapFootprint: bundle.company?.sap_footprint || [],
      };

      const parsedClient = clientProfileSchema.safeParse(rawClient);
      if (!parsedClient.success) {
        for (const issue of parsedClient.error.issues) {
          const key = String(issue.path[0] || 'client');
          if (!errors[key]) errors[key] = issue.message;
        }
      } else {
        clientPayload = parsedClient.data;
      }

      const parsedCompany = companyProfileSchema.safeParse(rawCompany);
      if (!parsedCompany.success) {
        for (const issue of parsedCompany.error.issues) {
          const key = String(issue.path[0] || 'company');
          if (!errors[key]) errors[key] = issue.message;
        }
      } else {
        companyPayload = parsedCompany.data;
      }
    }

    if (Object.keys(errors).length > 0 || !baseParsed.success) {
      setFieldErrors(errors);
      setSaveError('Please fix the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    try {
      const needsRoleCreation =
        (user.role === 'consultant' && !bundle.consultantProfile) ||
        (user.role === 'client' && !bundle.clientProfile);

      if (needsRoleCreation) {
        const createBody =
          user.role === 'consultant'
            ? { consultant: consultantPayload }
            : { client: clientPayload, company: companyPayload };

        const postRes = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(createBody),
        });
        const postJson = await postRes.json();
        if (!postRes.ok) {
          throw new Error(postJson.error?.message || 'Failed to create role profile');
        }

        const patchRes = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profile: baseParsed.data }),
        });
        const patchJson = await patchRes.json();
        if (!patchRes.ok) {
          throw new Error(patchJson.error?.message || 'Failed to update personal details');
        }
      } else {
        const patchBody =
          user.role === 'consultant'
            ? { profile: baseParsed.data, consultant: consultantPayload }
            : user.role === 'client'
              ? {
                  profile: baseParsed.data,
                  client: clientPayload,
                  company: companyPayload,
                }
              : { profile: baseParsed.data };

        const patchRes = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patchBody),
        });
        const patchJson = await patchRes.json();
        if (!patchRes.ok) {
          throw new Error(patchJson.error?.message || 'Failed to update profile');
        }
      }

      setSaveSuccess('Profile updated');
      await loadData();
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSkill = async () => {
    if (!bundle?.consultantProfile || !selectedSkillId) return;
    setSkillError(null);
    setSkillBusy(true);
    try {
      const res = await fetch(
        `/api/profile/consultants/${bundle.consultantProfile.id}/skills`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            skillId: selectedSkillId,
            isPrimary: consultantSkills.length === 0,
            yearsExperience: Number(skillYears) || 1,
            proficiencyLevel: skillProficiency,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Could not add skill');
      }
      await loadData();
      router.refresh();
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : 'Could not add skill');
    } finally {
      setSkillBusy(false);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    if (!bundle?.consultantProfile) return;
    setSkillError(null);
    setSkillBusy(true);
    try {
      const res = await fetch(
        `/api/profile/consultants/${bundle.consultantProfile.id}/skills/${skillId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Could not remove skill');
      }
      setConsultantSkills((prev) => prev.filter((item) => item.skill_id !== skillId));
      router.refresh();
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : 'Could not remove skill');
    } finally {
      setSkillBusy(false);
    }
  };

  const accountName =
    displayName ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    user?.email ||
    'CPI Lancers Member';
  const availableToAdd = allSkills.filter(
    (s) => !consultantSkills.some((cs) => cs.skill_id === s.id)
  );

  return (
    <DashboardShell
      accountName={accountName}
      accountEmail={user?.email}
      roleLabel={formatRoleLabel(user?.role)}
      initials={getInitials(accountName)}
      role={user?.role}
    >
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition-colors hover:text-[#365cf5]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Profile
          </Link>
        </div>

        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#365cf5]">
            Account Profile
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Edit profile
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Update your personal details, INR (₹) consulting terms, and SAP Integration expertise.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 space-y-5">
            <Card className="border-slate-200/80 bg-white p-6">
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
              </div>
            </Card>
          </div>
        ) : loadError ? (
          <Card className="mt-8 border-slate-200/80 bg-white p-6 text-center">
            <p className="text-sm font-medium text-rose-700">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void loadData(true)}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Retry
            </Button>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-6">
            {saveError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {saveSuccess}
                </span>
                <Link
                  href="/profile"
                  className="text-xs font-semibold text-emerald-800 underline"
                >
                  View profile
                </Link>
              </div>
            )}

            {/* Section A — Personal Details */}
            <Card className="border-slate-200/80 bg-white p-6 shadow-xs">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  Personal Details
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Shown on your CPI Lancers profile and community forum threads.
                </p>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Input
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  error={fieldErrors.firstName}
                  required
                />
                <Input
                  label="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  error={fieldErrors.lastName}
                  required
                />
                <Input
                  label="Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  error={fieldErrors.displayName}
                  required
                />
                <div>
                  <Input
                    label="City"
                    placeholder="e.g. Bengaluru"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    error={fieldErrors.city}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {INDIAN_HUB_CITIES.map((hub) => (
                      <button
                        key={hub}
                        type="button"
                        onClick={() => setCity(hub)}
                        className={`rounded-md border px-2 py-0.5 text-[11px] transition ${
                          city === hub
                            ? 'border-[#365cf5] bg-[#eef1ff] font-medium text-[#365cf5]'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {hub}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  label="Country Code (ISO-2)"
                  value={countryCode}
                  maxLength={2}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  error={fieldErrors.countryCode}
                />
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#172033]">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="h-11 w-full rounded-[10px] border border-[#dde1e7] bg-white px-3.5 text-sm text-[#172033] outline-none focus:border-[#365cf5] focus:ring-4 focus:ring-[#365cf5]/15"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-[13px] font-medium text-[#172033]">
                  Bio Summary
                </label>
                <textarea
                  rows={3}
                  placeholder="Brief summary of your SAP Integration background..."
                  value={bioSummary}
                  onChange={(e) => setBioSummary(e.target.value)}
                  className="w-full rounded-[10px] border border-[#dde1e7] bg-white px-3.5 py-2.5 text-sm text-[#172033] outline-none focus:border-[#365cf5] focus:ring-4 focus:ring-[#365cf5]/15"
                />
                {fieldErrors.bioSummary && (
                  <p className="mt-1 text-xs text-[#b42318]">{fieldErrors.bioSummary}</p>
                )}
              </div>
            </Card>

            {/* Section B — Role-Specific Profile */}
            {user?.role === 'consultant' && (
              <Card className="border-slate-200/80 bg-white p-6 shadow-xs">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">
                    SAP Consultant Profile
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Set your SAP CPI specialization, INR (₹) hourly rate, and IST availability.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Input
                      label="Professional Headline"
                      placeholder="Senior SAP CPI & Integration Suite Architect"
                      value={professionalHeadline}
                      onChange={(e) => setProfessionalHeadline(e.target.value)}
                      error={fieldErrors.professionalHeadline}
                      required
                    />
                  </div>
                  <Input
                    label="Years of SAP Experience"
                    type="number"
                    min={0}
                    max={50}
                    step="0.5"
                    value={yearsSapExperience}
                    onChange={(e) => setYearsSapExperience(e.target.value)}
                    error={fieldErrors.yearsSapExperience}
                  />
                  <Input
                    label="Years of CPI Experience"
                    type="number"
                    min={0}
                    max={50}
                    step="0.5"
                    value={yearsCpiExperience}
                    onChange={(e) => setYearsCpiExperience(e.target.value)}
                    error={fieldErrors.yearsCpiExperience}
                  />
                  <Input
                    label="Hourly Rate (INR ₹ / hr)"
                    type="number"
                    min={500}
                    max={50000}
                    step={50}
                    value={hourlyRateInr}
                    onChange={(e) => setHourlyRateInr(e.target.value)}
                    helperText="Range: ₹500 to ₹50,000 per hour"
                    error={fieldErrors.hourlyRateCents}
                    required
                  />
                  <Input
                    label="Available Hours / Week"
                    type="number"
                    min={0}
                    max={168}
                    value={availableHoursPerWeek}
                    onChange={(e) => setAvailableHoursPerWeek(e.target.value)}
                    error={fieldErrors.availableHoursPerWeek}
                  />
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[#172033]">
                      Availability Status
                    </label>
                    <select
                      value={availabilityStatus}
                      onChange={(e) =>
                        setAvailabilityStatus(e.target.value as AvailabilityStatus)
                      }
                      className="h-11 w-full rounded-[10px] border border-[#dde1e7] bg-white px-3.5 text-sm text-[#172033] outline-none focus:border-[#365cf5] focus:ring-4 focus:ring-[#365cf5]/15"
                    >
                      {AVAILABILITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="LinkedIn URL"
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                    value={linkedinProfileUrl}
                    onChange={(e) => setLinkedinProfileUrl(e.target.value)}
                    error={fieldErrors.linkedinProfileUrl}
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label="GitHub URL"
                      type="url"
                      placeholder="https://github.com/..."
                      value={githubProfileUrl}
                      onChange={(e) => setGithubProfileUrl(e.target.value)}
                      error={fieldErrors.githubProfileUrl}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-[13px] font-medium text-[#172033]">
                      Detailed Overview *
                    </label>
                    <textarea
                      rows={5}
                      placeholder="Describe your SAP CPI iFlow architecture, Groovy scripting, S/4HANA adapters, and PI/PO migration experience (min 50 characters)..."
                      value={overviewMarkdown}
                      onChange={(e) => setOverviewMarkdown(e.target.value)}
                      required
                      className="w-full rounded-[10px] border border-[#dde1e7] bg-white px-3.5 py-2.5 text-sm text-[#172033] outline-none focus:border-[#365cf5] focus:ring-4 focus:ring-[#365cf5]/15"
                    />
                    {fieldErrors.overviewMarkdown && (
                      <p className="mt-1 text-xs text-[#b42318]">{fieldErrors.overviewMarkdown}</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {user?.role === 'client' && (
              <Card className="border-slate-200/80 bg-white p-6 shadow-xs">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">
                    Enterprise Client &amp; Company Details
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Visible when posting SAP Integration briefs or reviewing consultant proposals.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Job Title"
                    placeholder="Integration Lead"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    error={fieldErrors.jobTitle}
                    required
                  />
                  <Input
                    label="Department"
                    placeholder="Enterprise Architecture"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    error={fieldErrors.department}
                  />
                  <Input
                    label="Billing Email"
                    type="email"
                    placeholder="ap@company.in"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    error={fieldErrors.billingEmail}
                  />
                  <Input
                    label="Company Legal Name"
                    placeholder="Acme Systems Pvt. Ltd."
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    error={fieldErrors.legalName}
                    required
                  />
                  <Input
                    label="Brand Name"
                    placeholder="Acme Systems"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    error={fieldErrors.brandName}
                  />
                  <Input
                    label="Industry"
                    placeholder="Manufacturing / IT Services"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    error={fieldErrors.industry}
                    required
                  />
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[#172033]">
                      Company Size
                    </label>
                    <select
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value as CompanySizeTier)}
                      className="h-11 w-full rounded-[10px] border border-[#dde1e7] bg-white px-3.5 text-sm text-[#172033] outline-none focus:border-[#365cf5] focus:ring-4 focus:ring-[#365cf5]/15"
                    >
                      {COMPANY_SIZE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Website URL"
                    type="url"
                    placeholder="https://company.in"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    error={fieldErrors.websiteUrl}
                  />
                </div>
              </Card>
            )}

            <div className="flex items-center justify-end gap-3">
              <Link href="/profile">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={saving}
                leftIcon={
                  saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )
                }
              >
                {saving ? 'Saving changes...' : 'Save profile'}
              </Button>
            </div>
          </form>
        )}

        {/* SAP Skills section when consultant profile exists */}
        {!loading && !loadError && user?.role === 'consultant' && bundle?.consultantProfile && (
          <Card className="mt-6 border-slate-200/80 bg-white p-6 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">
                SAP Integration Skills
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Add your SAP CPI, PI/PO, Groovy, and adapter skills so clients can discover your profile.
              </p>
            </div>

            {skillError && (
              <p className="mt-4 text-xs text-rose-600">{skillError}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {consultantSkills.length > 0 ? (
                consultantSkills.map((item) => (
                  <Badge
                    key={item.skill_id}
                    variant="sap"
                    className="flex items-center gap-2 py-1 pl-3 pr-2"
                  >
                    <span>
                      {item.skill?.name || 'Skill'} · {item.proficiency_level}
                    </span>
                    <button
                      type="button"
                      disabled={skillBusy}
                      aria-label={`Remove ${item.skill?.name || 'skill'}`}
                      onClick={() => handleRemoveSkill(item.skill_id)}
                      className="rounded p-0.5 text-slate-500 hover:bg-white/60 hover:text-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-slate-500">
                  No SAP skills added yet. Select a skill below to add it.
                </p>
              )}
            </div>

            {availableToAdd.length > 0 && (
              <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1.5fr_1fr_0.7fr_auto] sm:items-end">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-700">
                    Skill
                  </label>
                  <select
                    value={selectedSkillId}
                    onChange={(e) => setSelectedSkillId(e.target.value)}
                    className="h-10 w-full rounded-[10px] border border-[#dde1e7] bg-white px-3 text-sm text-[#172033] outline-none focus:border-[#365cf5]"
                  >
                    {availableToAdd.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-700">
                    Proficiency
                  </label>
                  <select
                    value={skillProficiency}
                    onChange={(e) =>
                      setSkillProficiency(e.target.value as ProficiencyLevel)
                    }
                    className="h-10 w-full rounded-[10px] border border-[#dde1e7] bg-white px-3 text-sm text-[#172033] outline-none focus:border-[#365cf5]"
                  >
                    {PROFICIENCY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Years"
                  type="number"
                  min={0}
                  max={50}
                  value={skillYears}
                  onChange={(e) => setSkillYears(e.target.value)}
                  className="h-10"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={skillBusy || !selectedSkillId}
                  onClick={handleAddSkill}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Add skill
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
