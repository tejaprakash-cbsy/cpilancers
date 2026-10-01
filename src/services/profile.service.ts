/**
 * Profile Service
 * Handles all profile-related operations with Supabase
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { 
  Profile, 
  ClientProfile, 
  ConsultantProfile,
  Skill,
  ConsultantSkill,
  Certification,
  ConsultantCertification,
  Portfolio,
  Company,
} from '@/types/database';
import {
  AppError,
  ForbiddenError,
} from '@/lib/errors';

// NOTE: `createBrowserClient`, `UserRole`, `UnauthorizedError`,
// `ValidationError`, `ConflictError` and the upload-size/mime constants
// (MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES, ALLOWED_DOCUMENT_TYPES) were imported
// and declared here but never referenced by any method -- no upload path exists
// on the server-side service. They were removed as dead code; reintroduce them
// alongside the upload endpoint that actually needs them.

/**
 * The Supabase Auth user, as returned by `supabase.auth.getUser()`.
 *
 * Distinct from the `User` row in this project's own `users` table (which
 * carries `role` and `status`): this is the identity-provider record, whose only
 * stable identifier is `id`. Typed structurally rather than as `any` so callers
 * cannot reach for fields that do not exist.
 */
export interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  created_at?: string;
  last_sign_in_at?: string | null;
}

/**
 * Whether a selected column should count toward profile completeness.
 *
 * Empty strings and empty arrays are treated as "not filled in" -- a column
 * present but holding `''` is indistinguishable from `NULL` to a user filling
 * in a form, and an empty `sap_footprint` array is not a populated list.
 * Numeric zero is intentionally left as "populated" here; callers that need
 * different semantics (e.g. a rating of 0 meaning "no reviews yet") apply that
 * rule themselves.
 */
function isPopulated(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export class ProfileService {
  static async getProfileBundle(userId: string) {
    const db = createAdminClient();
    const { data: profile, error: profileError } = await db.from('profiles').select('*').eq('user_id', userId).single();
    if (profileError || !profile) return null;
    const { data: user } = await db.from('users').select('id, email, role, status, is_email_verified').eq('id', userId).single();
    const { data: clientProfile } = await db.from('client_profiles').select('*').eq('user_id', userId).maybeSingle();
    const { data: consultantProfile } = await db.from('consultant_profiles').select('*').eq('user_id', userId).maybeSingle();
    const company = clientProfile?.company_id
      ? (await db.from('companies').select('*').eq('id', clientProfile.company_id).single()).data
      : null;
    const skills = consultantProfile
      ? (await db.from('consultant_skills').select('*, skill:skill_id (*)').eq('consultant_id', consultantProfile.id)).data || []
      : [];
    const certifications = consultantProfile
      ? (await db.from('consultant_certifications').select('*, certification:certification_id (*)').eq('consultant_id', consultantProfile.id)).data || []
      : [];
    const portfolios = consultantProfile
      ? (await db.from('portfolios').select('*').eq('consultant_id', consultantProfile.id).order('created_at', { ascending: false })).data || []
      : [];
    return { profile, user, clientProfile, consultantProfile, company, skills, certifications, portfolios };
  }

  static async getPublicConsultantProfile(consultantId: string) {
    const db = createAdminClient();
    const { data: consultant, error } = await db.from('consultant_profiles').select('id, user_id, professional_headline, years_sap_experience, years_cpi_experience, hourly_rate_cents, min_project_size_cents, availability_status, available_hours_per_week, github_profile_url, linkedin_profile_url, overview_markdown, avg_rating, total_reviews_count, completed_contracts_count, profile_score, created_at, updated_at').eq('id', consultantId).single();
    if (error || !consultant) return null;
    const { data: profile } = await db.from('profiles').select('id, first_name, last_name, display_name, avatar_url, timezone, country_code, city, bio_summary').eq('user_id', consultant.user_id).single();
    const { data: skills } = await db.from('consultant_skills').select('*, skill:skill_id (*)').eq('consultant_id', consultantId);
    const { data: certifications } = await db.from('consultant_certifications').select('id, consultant_id, certification_id, custom_name, credential_id, issue_date, expiry_date, verification_status, verified_at, created_at').eq('consultant_id', consultantId).eq('verification_status', 'verified');
    const { data: portfolios } = await db.from('portfolios').select('*').eq('consultant_id', consultantId);
    return { profile, consultant, skills: skills || [], certifications: certifications || [], portfolios: portfolios || [] };
  }

  static async getPublicClientProfile(clientId: string) {
    const db = createAdminClient();
    const { data: client, error } = await db.from('client_profiles').select('id, company_id, job_title').eq('id', clientId).single();
    if (error || !client) return null;
    const { data: company } = await db.from('companies').select('id, legal_name, brand_name, website_url, industry, company_size, sap_footprint, logo_url, is_verified').eq('id', client.company_id).single();
    return { client, company };
  }

  static async updateOwnBaseProfile(userId: string, data: Partial<Profile>) {
    const db = createAdminClient();
    const allowed: Partial<Profile> = {
      first_name: data.first_name,
      last_name: data.last_name,
      display_name: data.display_name,
      avatar_url: data.avatar_url,
      timezone: data.timezone,
      country_code: data.country_code,
      city: data.city,
      bio_summary: data.bio_summary,
      updated_at: new Date().toISOString(),
    };
    const { data: profile, error } = await db.from('profiles').update(allowed).eq('user_id', userId).select('*').single();
    if (error || !profile) throw new AppError('Failed to update profile.', 500, 'PROFILE_UPDATE_ERROR', error);
    return profile as Profile;
  }

  static async updateOwnConsultantProfile(userId: string, data: Partial<ConsultantProfile>) {
    const db = createAdminClient();
    const allowed: Partial<ConsultantProfile> = {
      professional_headline: data.professional_headline,
      years_sap_experience: data.years_sap_experience,
      years_cpi_experience: data.years_cpi_experience,
      hourly_rate_cents: data.hourly_rate_cents,
      min_project_size_cents: data.min_project_size_cents,
      availability_status: data.availability_status,
      available_hours_per_week: data.available_hours_per_week,
      github_profile_url: data.github_profile_url,
      linkedin_profile_url: data.linkedin_profile_url,
      overview_markdown: data.overview_markdown,
      updated_at: new Date().toISOString(),
    };
    const { data: profile, error } = await db.from('consultant_profiles').update(allowed).eq('user_id', userId).select('*').single();
    if (error || !profile) throw new AppError('Failed to update consultant profile.', 500, 'CONSULTANT_PROFILE_UPDATE_ERROR', error);
    return profile as ConsultantProfile;
  }

  static async updateOwnClientProfile(userId: string, data: Partial<ClientProfile>) {
    const db = createAdminClient();
    const allowed: Partial<ClientProfile> = { job_title: data.job_title, department: data.department, billing_email: data.billing_email, updated_at: new Date().toISOString() };
    const { data: profile, error } = await db.from('client_profiles').update(allowed).eq('user_id', userId).select('*').single();
    if (error || !profile) throw new AppError('Failed to update client profile.', 500, 'CLIENT_PROFILE_UPDATE_ERROR', error);
    return profile as ClientProfile;
  }

  static async getPortfolios(consultantId: string): Promise<Portfolio[]> {
    const { data, error } = await createAdminClient().from('portfolios').select('*').eq('consultant_id', consultantId).order('created_at', { ascending: false });
    if (error) throw new AppError('Failed to fetch portfolios.', 500, 'PORTFOLIO_FETCH_ERROR', error);
    return (data || []) as Portfolio[];
  }

  private static async assertConsultantOwner(consultantId: string, userId: string) {
    const { data } = await createAdminClient().from('consultant_profiles').select('user_id').eq('id', consultantId).single();
    if (!data || data.user_id !== userId) throw new ForbiddenError('You do not own this consultant profile.');
  }

  static async createPortfolio(userId: string, consultantId: string, data: Omit<Portfolio, 'id' | 'consultant_id' | 'created_at' | 'updated_at'>): Promise<Portfolio> {
    await this.assertConsultantOwner(consultantId, userId);
    const { data: portfolio, error } = await createAdminClient().from('portfolios').insert({ consultant_id: consultantId, ...data }).select('*').single();
    if (error || !portfolio) throw new AppError('Failed to create portfolio.', 500, 'PORTFOLIO_CREATE_ERROR', error);
    return portfolio as Portfolio;
  }

  static async updatePortfolio(userId: string, consultantId: string, portfolioId: string, data: Partial<Omit<Portfolio, 'id' | 'consultant_id' | 'created_at' | 'updated_at'>>): Promise<Portfolio> {
    await this.assertConsultantOwner(consultantId, userId);
    const { data: portfolio, error } = await createAdminClient().from('portfolios').update({ ...data, updated_at: new Date().toISOString() }).eq('id', portfolioId).eq('consultant_id', consultantId).select('*').single();
    if (error || !portfolio) throw new AppError('Failed to update portfolio.', 500, 'PORTFOLIO_UPDATE_ERROR', error);
    return portfolio as Portfolio;
  }

  static async deletePortfolio(userId: string, consultantId: string, portfolioId: string): Promise<void> {
    await this.assertConsultantOwner(consultantId, userId);
    const { error } = await createAdminClient().from('portfolios').delete().eq('id', portfolioId).eq('consultant_id', consultantId);
    if (error) throw new AppError('Failed to delete portfolio.', 500, 'PORTFOLIO_DELETE_ERROR', error);
  }
  /**
   * Get current user's profile
   */
  static async getProfile(): Promise<{ profile: Profile; user: AuthUser } | null> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) return null;
      
      // Get profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error('[DB Error - Get Profile]:', error);
        return null;
      }
      
      if (!profile) return null;
      
      return { profile, user };
    } catch (error) {
      console.error('[ProfileService.getProfile]:', error);
      return null;
    }
  }

  /**
   * Get profile by user ID
   */
  static async getProfileByUserId(userId: string): Promise<Profile | null> {
    try {
      const supabase = await createClient();
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error('[DB Error - Get Profile By User ID]:', error);
        return null;
      }
      
      return profile;
    } catch (error) {
      console.error('[ProfileService.getProfileByUserId]:', error);
      return null;
    }
  }

  /**
   * Get consultant profile by consultant ID
   */
  static async getConsultantProfileById(consultantId: string): Promise<ConsultantProfile | null> {
    try {
      const supabase = await createClient();
      
      const { data: consultantProfile, error } = await supabase
        .from('consultant_profiles')
        .select('*')
        .eq('id', consultantId)
        .single();
      
      if (error) {
        console.error('[DB Error - Get Consultant Profile By ID]:', error);
        return null;
      }
      
      return consultantProfile;
    } catch (error) {
      console.error('[ProfileService.getConsultantProfileById]:', error);
      return null;
    }
  }

  /**
   * Get client profile by client ID
   */
  static async getClientProfileById(clientId: string): Promise<ClientProfile | null> {
    try {
      const supabase = await createClient();
      
      const { data: clientProfile, error } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('id', clientId)
        .single();
      
      if (error) {
        console.error('[DB Error - Get Client Profile By ID]:', error);
        return null;
      }
      
      return clientProfile;
    } catch (error) {
      console.error('[ProfileService.getClientProfileById]:', error);
      return null;
    }
  }

  /**
   * Get company by company ID
   */
  static async getCompanyById(companyId: string): Promise<Company | null> {
    try {
      const supabase = await createClient();
      
      const { data: company, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      
      if (error) {
        console.error('[DB Error - Get Company By ID]:', error);
        return null;
      }
      
      return company;
    } catch (error) {
      console.error('[ProfileService.getCompanyById]:', error);
      return null;
    }
  }

/**
   * Get consultant profile by user ID
   */
  static async getConsultantProfileByUserId(userId: string): Promise<ConsultantProfile | null> {
    try {
      const supabase = await createClient();
      const { data: consultantProfile, error } = await supabase
        .from('consultant_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (error) {
        console.error('[DB Error - Get Consultant Profile By User ID]:', error);
        return null;
      }
      return consultantProfile;
    } catch (error) {
      console.error('[ProfileService.getConsultantProfileByUserId]:', error);
      return null;
    }
  }

  /**
   * Get client profile by user ID
   */
  static async getClientProfileByUserId(userId: string): Promise<ClientProfile | null> {
    try {
      const supabase = await createClient();
      const { data: clientProfile, error } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (error) {
        console.error('[DB Error - Get Client Profile By User ID]:', error);
        return null;
      }
      return clientProfile;
    } catch (error) {
      console.error('[ProfileService.getClientProfileByUserId]:', error);
      return null;
    }
  }

  /**
   * Upsert client profile
   */
  static async upsertClientProfile(data: Partial<ClientProfile>): Promise<ClientProfile> {
    try {
      const adminSupabase = createAdminClient();
      const { data: clientProfile, error } = await adminSupabase
        .from('client_profiles')
        .upsert(data, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) {
        console.error('[DB Error - Upsert Client Profile]:', error);
        throw new AppError('Failed to upsert client profile', 500);
      }
      return clientProfile;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[ProfileService.upsertClientProfile]:', error);
      throw new AppError('Failed to upsert client profile', 500);
    }
  }

  /**
   * Upsert consultant profile
   */
  static async upsertConsultantProfile(data: Partial<ConsultantProfile>): Promise<ConsultantProfile> {
    try {
      const adminSupabase = createAdminClient();
      const { data: consultantProfile, error } = await adminSupabase
        .from('consultant_profiles')
        .upsert(data, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) {
        console.error('[DB Error - Upsert Consultant Profile]:', error);
        throw new AppError('Failed to upsert consultant profile', 500);
      }
      return consultantProfile;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[ProfileService.upsertConsultantProfile]:', error);
      throw new AppError('Failed to upsert consultant profile', 500);
    }
  }

  /**
   * Get consultant skills with skill details
   */
  static async getConsultantSkills(consultantId: string): Promise<Array<ConsultantSkill & { skill: Skill }>> {
    try {
      const supabase = await createClient();
      const { data: consultantSkills, error } = await supabase
        .from('consultant_skills')
        .select(`
          *,
          skill:skill_id (*)
        `)
        .eq('consultant_id', consultantId);
      if (error) {
        console.error('[DB Error - Get Consultant Skills]:', error);
        return [];
      }
      return consultantSkills as Array<ConsultantSkill & { skill: Skill }>;
    } catch (error) {
      console.error('[ProfileService.getConsultantSkills]:', error);
      return [];
    }
  }

  /**
   * Get all active skills
   */
  static async getSkills(): Promise<Skill[]> {
    try {
      const supabase = await createClient();
      const { data: skills, error } = await supabase
        .from('skills')
        .select('*')
        .eq('is_active', true);
      if (error) {
        console.error('[DB Error - Get Skills]:', error);
        return [];
      }
      return skills as Skill[];
    } catch (error) {
      console.error('[ProfileService.getSkills]:', error);
      return [];
    }
  }

  /**
   * Add a consultant skill
   */
  static async addConsultantSkill(consultantId: string, data: Omit<ConsultantSkill, 'id' | 'consultant_id'>): Promise<ConsultantSkill> {
    try {
      const adminSupabase = createAdminClient();
      const { data: consultantSkill, error } = await adminSupabase
        .from('consultant_skills')
        .insert({
          consultant_id: consultantId,
          ...data,
        })
        .select()
        .single();
      if (error) {
        console.error('[DB Error - Add Consultant Skill]:', error);
        throw new AppError('Failed to add consultant skill', 500);
      }
      return consultantSkill;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[ProfileService.addConsultantSkill]:', error);
      throw new AppError('Failed to add consultant skill', 500);
    }
  }

  /**
   * Remove a consultant skill
   */
  static async removeConsultantSkill(consultantId: string, skillId: string): Promise<void> {
    try {
      const adminSupabase = createAdminClient();
      const { error } = await adminSupabase
        .from('consultant_skills')
        .delete()
        .match({ consultant_id: consultantId, skill_id: skillId });
      if (error) {
        console.error('[DB Error - Remove Consultant Skill]:', error);
        throw new AppError('Failed to remove consultant skill', 500);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[ProfileService.removeConsultantSkill]:', error);
      throw new AppError('Failed to remove consultant skill', 500);
    }
  }

  /**
   * Get consultant certifications with certification details
   */
  static async getConsultantCertifications(consultantId: string): Promise<Array<ConsultantCertification & { certification: Certification }>> {
    try {
      const supabase = await createClient();
      const { data: consultantCertifications, error } = await supabase
        .from('consultant_certifications')
        .select(`
          *,
          certification:certification_id (*)
        `)
        .eq('consultant_id', consultantId);
      if (error) {
        console.error('[DB Error - Get Consultant Certifications]:', error);
        return [];
      }
      return consultantCertifications as Array<ConsultantCertification & { certification: Certification }>;
    } catch (error) {
      console.error('[ProfileService.getConsultantCertifications]:', error);
      return [];
    }
  }

  /**
   * Add a consultant certification
   */
  static async addConsultantCertification(consultantId: string, data: Omit<ConsultantCertification, 'id' | 'consultant_id'>): Promise<ConsultantCertification> {
    try {
      const adminSupabase = createAdminClient();
      const { data: consultantCert, error } = await adminSupabase
        .from('consultant_certifications')
        .insert({
          consultant_id: consultantId,
          ...data,
        })
        .select()
        .single();
      if (error) {
        console.error('[DB Error - Add Consultant Certification]:', error);
        throw new AppError('Failed to add consultant certification', 500);
      }
      return consultantCert;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[ProfileService.addConsultantCertification]:', error);
      throw new AppError('Failed to add consultant certification', 500);
    }
  }

  /**
   * Calculate profile completeness percentage
   */
  static async calculateProfileCompleteness(profile: Profile, type: 'client' | 'consultant'): Promise<number> {
    try {
      let completed = 0;
      let total = 0;

      // Base profile fields
      const baseFields = ['first_name', 'last_name', 'display_name', 'avatar_url', 'timezone', 'country_code', 'city', 'bio_summary'];
      for (const field of baseFields) {
        total++;
        if (profile[field as keyof Profile] !== null && profile[field as keyof Profile] !== undefined && profile[field as keyof Profile] !== '') {
          completed++;
        }
      }

      // Type-specific fields
      if (type === 'client') {
        // fetch client profile
        const supabase = await createClient();
        const { data: clientProfile } = await supabase
          .from('client_profiles')
          .select('company_id, job_title, department, billing_email')
          .eq('user_id', profile.user_id)
          .single();
        if (clientProfile) {
          const clientFields = ['company_id', 'job_title', 'department', 'billing_email'] as const;
          for (const field of clientFields) {
            total++;
            if (isPopulated(clientProfile[field])) {
              completed++;
            }
          }
          // company
          if (clientProfile.company_id) {
            const { data: company } = await supabase
              .from('companies')
              .select('legal_name, brand_name, website_url, industry, company_size, sap_footprint, logo_url, tax_identifier, is_verified')
              .eq('id', clientProfile.company_id)
              .single();
            if (company) {
              const companyFields = ['legal_name', 'brand_name', 'website_url', 'industry', 'company_size', 'sap_footprint', 'logo_url', 'tax_identifier', 'is_verified'] as const;
              for (const field of companyFields) {
                total++;
                if (isPopulated(company[field])) {
                  completed++;
                }
              }
            }
          }
        }
      } else if (type === 'consultant') {
        // fetch consultant profile
        const supabase = await createClient();
        const { data: consultantProfile } = await supabase
          .from('consultant_profiles')
          .select('professional_headline, years_sap_experience, years_cpi_experience, hourly_rate_cents, min_project_size_cents, availability_status, available_hours_per_week, github_profile_url, linkedin_profile_url, overview_markdown, avg_rating, total_reviews_count, completed_contracts_count')
          .eq('user_id', profile.user_id)
          .single();
        if (consultantProfile) {
          // NOTE: the original array literal was missing a closing quote on
          // `'available_hours_per_week`, which swallowed every following field
          // into one string. The loop therefore ran a single iteration keyed on
          // a field name that does not exist, so the consultant completeness
          // score counted 1 checked field out of 1 total instead of 13 of 13 --
          // a consultant at 100% scored the same as one with nothing filled in.
          const consultantFields = [
            'professional_headline',
            'years_sap_experience',
            'years_cpi_experience',
            'hourly_rate_cents',
            'min_project_size_cents',
            'availability_status',
            'available_hours_per_week',
            'github_profile_url',
            'linkedin_profile_url',
            'overview_markdown',
            'avg_rating',
            'total_reviews_count',
            'completed_contracts_count',
          ] as const;
          for (const field of consultantFields) {
            total++;
            // A zero rating/review count is genuinely "not populated yet", so
            // numeric zero is excluded here even though it is a real value.
            if (isPopulated(consultantProfile[field]) && !(typeof consultantProfile[field] === 'number' && consultantProfile[field] === 0)) {
              completed++;
            }
          }
          // skills count
          const { data: consultantSkills } = await supabase
            .from('consultant_skills')
            .select('id')
            .eq('consultant_id', profile.id);
          if (consultantSkills) {
            total++;
            if (consultantSkills.length > 0) completed++;
          }
          // certifications count
          const { data: consultantCertifications } = await supabase
            .from('consultant_certifications')
            .select('id')
            .eq('consultant_id', profile.id);
          if (consultantCertifications) {
            total++;
            if (consultantCertifications.length > 0) completed++;
          }
        }
      }

      const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
      return percentage;
    } catch (error) {
      console.error('[ProfileService.calculateProfileCompleteness]:', error);
      return 0;
    }
  }
}
