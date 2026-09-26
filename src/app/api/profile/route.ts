import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProfileService } from '@/services/profile.service';
import { profileSchema, consultantProfileSchema, clientProfileSchema, companyProfileSchema } from '@/lib/validations/profile.schemas';
import { formatErrorResponse } from '@/lib/errors';

export async function GET() {
  const user = await AuthService.getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
  return NextResponse.json({ success: true, data: await ProfileService.getProfileBundle(user.id) });
}

export async function POST(request: Request) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    const body = await request.json() as { consultant?: unknown; client?: unknown; company?: unknown };
    const db = (await import('@/lib/supabase/admin')).createAdminClient();
    if (user.role === 'consultant') {
      const consultant = consultantProfileSchema.parse(body.consultant);
      const { data, error } = await db.from('consultant_profiles').insert({ user_id: user.id, professional_headline: consultant.professionalHeadline, years_sap_experience: consultant.yearsSapExperience, years_cpi_experience: consultant.yearsCpiExperience, hourly_rate_cents: consultant.hourlyRateCents, min_project_size_cents: consultant.minProjectSizeCents, availability_status: consultant.availabilityStatus, available_hours_per_week: consultant.availableHoursPerWeek, github_profile_url: consultant.githubProfileUrl, linkedin_profile_url: consultant.linkedinProfileUrl, overview_markdown: consultant.overviewMarkdown }).select('*').single();
      if (error || !data) throw new Error('Failed to create consultant profile.');
      return NextResponse.json({ success: true, data }, { status: 201 });
    }
    const client = clientProfileSchema.parse(body.client);
    const company = companyProfileSchema.parse(body.company);
    const { data: companyRow, error: companyError } = await db.from('companies').insert({ legal_name: company.legalName, brand_name: company.brandName, website_url: company.websiteUrl, industry: company.industry, company_size: company.companySize, sap_footprint: company.sapFootprint }).select('*').single();
    if (companyError || !companyRow) throw new Error('Failed to create company profile.');
    const { data, error } = await db.from('client_profiles').insert({ user_id: user.id, company_id: companyRow.id, job_title: client.jobTitle, department: client.department, billing_email: client.billingEmail }).select('*').single();
    if (error || !data) { await db.from('companies').delete().eq('id', companyRow.id); throw new Error('Failed to create client profile.'); }
    return NextResponse.json({ success: true, data: { client: data, company: companyRow } }, { status: 201 });
  } catch (error: unknown) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    const body = await request.json() as { profile?: unknown; consultant?: unknown; client?: unknown; company?: unknown };
    const updated: Record<string, unknown> = {};
    if (body.profile) updated.profile = await ProfileService.updateOwnBaseProfile(user.id, toBaseProfile(profileSchema.parse(body.profile)));
    if (user.role === 'consultant' && body.consultant) updated.consultant = await ProfileService.updateOwnConsultantProfile(user.id, toConsultantProfile(consultantProfileSchema.parse(body.consultant)));
    if (user.role === 'client' && body.client) updated.client = await ProfileService.updateOwnClientProfile(user.id, toClientProfile(clientProfileSchema.parse(body.client)));
    if (user.role === 'client' && body.company) updated.company = await updateOwnCompany(user.id, companyProfileSchema.parse(body.company));
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

function toBaseProfile(value: ReturnType<typeof profileSchema.parse>) {
  return { first_name: value.firstName, last_name: value.lastName, display_name: value.displayName, bio_summary: value.bioSummary, timezone: value.timezone, country_code: value.countryCode, city: value.city };
}
function toConsultantProfile(value: ReturnType<typeof consultantProfileSchema.parse>) {
  return { professional_headline: value.professionalHeadline, years_sap_experience: value.yearsSapExperience, years_cpi_experience: value.yearsCpiExperience, hourly_rate_cents: value.hourlyRateCents, min_project_size_cents: value.minProjectSizeCents, availability_status: value.availabilityStatus, available_hours_per_week: value.availableHoursPerWeek, github_profile_url: value.githubProfileUrl, linkedin_profile_url: value.linkedinProfileUrl, overview_markdown: value.overviewMarkdown };
}
function toClientProfile(value: ReturnType<typeof clientProfileSchema.parse>) {
  return { job_title: value.jobTitle, department: value.department, billing_email: value.billingEmail };
}
async function updateOwnCompany(userId: string, value: ReturnType<typeof companyProfileSchema.parse>) {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const db = createAdminClient();
  const { data: client } = await db.from('client_profiles').select('company_id').eq('user_id', userId).single();
  if (!client) throw new Error('Client profile not found.');
  const { data, error } = await db.from('companies').update({ legal_name: value.legalName, brand_name: value.brandName, website_url: value.websiteUrl, industry: value.industry, company_size: value.companySize, sap_footprint: value.sapFootprint, updated_at: new Date().toISOString() }).eq('id', client.company_id).select('*').single();
  if (error || !data) throw new Error('Failed to update company profile.');
  return data;
}
