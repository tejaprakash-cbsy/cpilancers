/**
 * Authentication Service
 * Handles all authentication operations with Supabase Auth
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole, User } from '@/types/database';
import {
  AppError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
  RateLimitError,
} from '@/lib/errors';

export interface RegisterParams {
  email: string;
  password: string;
  role: 'client' | 'consultant';
  firstName: string;
  lastName: string;
}

export interface LoginParams {
  email: string;
  password: string;
}

export { getAppUrl } from '@/lib/auth/app-url';
import { getAppUrl } from '@/lib/auth/app-url';

function errorMetadata(error: { code?: string; status?: number } | null | undefined) {
  return {
    code: error?.code ?? 'unknown',
    status: error?.status,
  };
}

export function isRateLimitError(error: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'email_rate_limit_exceeded' ||
    error.code === 'over_sms_send_rate_limit' ||
    error.code === 'sms_rate_limit_exceeded' ||
    error.status === 429 ||
    /rate limit|too many requests|once every \d+ seconds/i.test(error.message || '')
  );
}

const isEmailRateLimitError = isRateLimitError;

async function cleanupPartialRegistration(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  removeUserRow: boolean,
) {
  if (removeUserRow) {
    try {
      const { error } = await adminSupabase.from('users').delete().eq('id', userId);
      if (error) {
        console.error('[DB Cleanup Error - Delete User Row]:', errorMetadata(error));
      }
    } catch (error) {
      console.error('[DB Cleanup Error - Delete User Row]:', errorMetadata(error as { code?: string; status?: number }));
    }
  }

  try {
    const { error } = await adminSupabase.auth.admin.deleteUser(userId);
    if (error) {
      console.error('[Auth Cleanup Error - Delete User]:', errorMetadata(error));
    }
  } catch (error) {
    console.error('[Auth Cleanup Error - Delete User]:', errorMetadata(error as { code?: string; status?: number }));
  }
}

export class AuthService {
  /**
   * Register a new user with email/password and role
   */
  static async register(params: RegisterParams) {
    try {
      const supabase = await createClient();

      // Validate role (prevent admin registration)
      if (params.role !== 'client' && params.role !== 'consultant') {
        throw new ValidationError('Invalid role. Must be client or consultant.');
      }

      // Anonymous SELECT on public.users is revoked by the core RLS policy.
      // Use the server-only client so duplicate registrations do not fall
      // through to Auth's enumeration-safe response and become 500s.
      let adminSupabase: ReturnType<typeof createAdminClient>;
      try {
        adminSupabase = createAdminClient();
      } catch (error) {
        console.error('[Auth Configuration Error - Register]:', error instanceof Error ? error.message : 'unknown');
        throw new AppError('Registration is temporarily unavailable.', 503, 'AUTH_CONFIGURATION_ERROR');
      }
      const normalizedEmail = params.email.toLowerCase();

      // Check if user already exists
      const { data: existingUser, error: existingUserError } = await adminSupabase
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingUserError) {
        console.error('[DB Error - Check Existing User]:', errorMetadata(existingUserError));
        throw new AppError('Registration is temporarily unavailable.', 503, 'AUTH_REGISTRATION_UNAVAILABLE');
      }

      if (existingUser) {
        throw new ConflictError('An account with this email already exists.');
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: params.password,
        options: {
          emailRedirectTo: `${getAppUrl()}/api/auth/callback`,
          data: {
            role: params.role,
            first_name: params.firstName,
            last_name: params.lastName,
          },
        },
      });

      if (authError) {
        console.error('[Auth Error - Register]:', errorMetadata(authError));
        if (authError.code === 'user_already_exists') {
          throw new ConflictError('An account with this email already exists.');
        }
        if (isEmailRateLimitError(authError)) {
          throw new RateLimitError('Too many verification emails requested. Please wait a few minutes before trying again.');
        }
        throw new AppError(authError.message, 400, 'AUTH_SIGNUP_ERROR');
      }

      if (!authData.user) {
        // Supabase may intentionally return no user for an existing email
        // when email enumeration protection is enabled.
        throw new ConflictError('An account with this email already exists.');
      }

      // Use admin client to create user record with role
      // (Regular client cannot insert into users table due to RLS)
      const { error: userError } = await adminSupabase.from('users').insert({
        id: authData.user.id,
        email: normalizedEmail,
        role: params.role,
        status: 'active',
        is_email_verified: false,
      });

      if (userError) {
        console.error('[DB Error - Create User]:', errorMetadata(userError));
        // Attempt cleanup of auth user if DB insert fails
        await cleanupPartialRegistration(adminSupabase, authData.user.id, false);
        if (userError.code === '23505') {
          throw new ConflictError('An account with this email already exists.');
        }
        throw new AppError('Failed to create user profile', 500);
      }

      // Create base profile
      const { error: profileError } = await adminSupabase.from('profiles').insert({
        user_id: authData.user.id,
        first_name: params.firstName,
        last_name: params.lastName,
        display_name: `${params.firstName} ${params.lastName}`,
        timezone: 'UTC',
        country_code: 'US', // Default, can be updated later
      });

      if (profileError) {
        console.error('[DB Error - Create Profile]:', errorMetadata(profileError));
        // Do not report success for a partial registration. Clean up both
        // application rows and the Auth user so the email can be retried.
        await cleanupPartialRegistration(adminSupabase, authData.user.id, true);
        throw new AppError('Failed to create user profile', 500);
      }

      return {
        user: authData.user,
        session: authData.session,
        emailSent: true,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[AuthService.register]:', error);
      throw new AppError('Registration failed. Please try again.', 500);
    }
  }

  /**
   * Login user with email and password
   */
  static async login(params: LoginParams) {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: params.email.toLowerCase(),
        password: params.password,
      });

      if (error) {
        console.error('[Auth Error - Login]:', error);
        throw new UnauthorizedError('Invalid email or password.');
      }

      if (!data.user) {
        throw new UnauthorizedError('Authentication failed.');
      }

      // Update last login timestamp
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', data.user.id);

      return {
        user: data.user,
        session: data.session,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[AuthService.login]:', error);
      throw new AppError('Login failed. Please try again.', 500);
    }
  }

  /**
   * Logout current user
   */
  static async logout() {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('[Auth Error - Logout]:', error);
        throw new AppError('Logout failed', 500);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[AuthService.logout]:', error);
      throw new AppError('Logout failed. Please try again.', 500);
    }
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(email: string) {
    try {
      const supabase = await createClient();

      const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
        redirectTo: `${getAppUrl()}/auth/reset-password`,
      });

      if (error) {
        console.error('[Auth Error - Password Reset]:', error);
        if (isEmailRateLimitError(error)) {
          throw new RateLimitError('Too many verification emails requested. Please wait a few minutes before trying again.');
        }
        // Don't reveal if email exists or not for security
        // Just return success
      }

      return { success: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[AuthService.sendPasswordResetEmail]:', error);
      // Return success even on error to prevent email enumeration
      return { success: true };
    }
  }

  /**
   * Update password with reset token
   */
  static async updatePassword(newPassword: string) {
    try {
      const supabase = await createClient();

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('[Auth Error - Update Password]:', error);
        throw new AppError('Failed to update password', 400);
      }

      return { success: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[AuthService.updatePassword]:', error);
      throw new AppError('Password update failed. Please try again.', 500);
    }
  }

  /**
   * Get current authenticated user with role
   */
  static async getCurrentUser(): Promise<User | null> {
    try {
      const supabase = await createClient();

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) return null;

      // Fetch user record with role
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error) {
        console.error('[DB Error - Get User]:', error);
        return null;
      }

      return user;
    } catch (error) {
      console.error('[AuthService.getCurrentUser]:', error);
      return null;
    }
  }

  /**
   * Get current user's session
   */
  static async getSession() {
    try {
      const supabase = await createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session;
    } catch (error) {
      console.error('[AuthService.getSession]:', error);
      return null;
    }
  }

  /**
   * Check if user has specific role
   */
  static async hasRole(role: UserRole): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return user?.role === role;
    } catch (error) {
      console.error('[AuthService.hasRole]:', error);
      return false;
    }
  }

  /**
   * Resend verification email
   */
  static async resendVerificationEmail(email: string) {
    try {
      const supabase = await createClient();

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.toLowerCase(),
        options: {
          emailRedirectTo: `${getAppUrl()}/api/auth/callback`,
        },
      });

      if (error) {
        // Log error internally for monitoring without leaking account existence to clients
        console.error('[Auth Error - Resend Verification]:', error.message || error);
        if (isEmailRateLimitError(error)) {
          throw new RateLimitError('Too many verification emails requested. Please wait a few minutes before trying again.');
        }
      }

      // Always return success to prevent user enumeration
      return { success: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[AuthService.resendVerificationEmail]:', error);
      // Fail neutral: always return success to caller
      return { success: true };
    }
  }

  /**
   * Idempotently ensure user and profile records exist in public tables
   * for an authenticated Supabase user.
   *
   * Strict Role Security:
   * - Only 'client' and 'consultant' are permitted as requested roles.
   * - Defaults to 'client' if not provided, unrecognized, or if 'admin' was attempted.
   * - Under NO circumstances can 'admin' be assigned from query params, request bodies, or OAuth metadata.
   */
  static async ensureUserRecords(
    authUser: {
      id: string;
      email?: string | null;
      phone?: string | null;
      user_metadata?: Record<string, unknown> | null;
    },
    requestedRole?: string | null
  ): Promise<{ user: User; isNew: boolean }> {
    const adminSupabase = createAdminClient();

    // 1. Check if user already exists
    const { data: existingUser, error: checkError } = await adminSupabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (checkError) {
      console.error('[AuthService.ensureUserRecords - Check User]:', errorMetadata(checkError));
      throw new AppError('Database lookup failed while ensuring user records', 500);
    }

    if (existingUser) {
      // User exists. Ensure profile also exists idempotently
      const { data: existingProfile } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (!existingProfile) {
        const metadata = authUser.user_metadata || {};
        const fullName = (typeof metadata.full_name === 'string' ? metadata.full_name : typeof metadata.name === 'string' ? metadata.name : '').trim();
        const firstName = typeof metadata.given_name === 'string' ? metadata.given_name : typeof metadata.first_name === 'string' ? metadata.first_name : (fullName ? fullName.split(' ')[0] : 'User');
        const lastName = typeof metadata.family_name === 'string' ? metadata.family_name : typeof metadata.last_name === 'string' ? metadata.last_name : (fullName ? fullName.split(' ').slice(1).join(' ') : '');
        const displayName = fullName || `${firstName} ${lastName}`.trim() || (authUser.email ? authUser.email.split('@')[0] : authUser.phone || 'User');
        const avatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : typeof metadata.picture === 'string' ? metadata.picture : null;

        await adminSupabase.from('profiles').insert({
          user_id: authUser.id,
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          avatar_url: avatarUrl,
          timezone: 'UTC',
          country_code: 'US',
        });
      }

      return { user: existingUser as User, isNew: false };
    }

    // 2. Strict Role Security: Only allow 'client' or 'consultant'; default 'client'.
    // NEVER allow 'admin' from query params, request bodies, or OAuth metadata.
    let assignedRole: 'client' | 'consultant' = 'client';
    if (requestedRole === 'consultant' || requestedRole === 'client') {
      assignedRole = requestedRole;
    } else if (authUser.user_metadata?.role === 'consultant' || authUser.user_metadata?.role === 'client') {
      assignedRole = authUser.user_metadata.role;
    }

    const metadata = authUser.user_metadata || {};
    const fullName = (typeof metadata.full_name === 'string' ? metadata.full_name : typeof metadata.name === 'string' ? metadata.name : '').trim();
    const firstName = typeof metadata.given_name === 'string' ? metadata.given_name : typeof metadata.first_name === 'string' ? metadata.first_name : (fullName ? fullName.split(' ')[0] : 'User');
    const lastName = typeof metadata.family_name === 'string' ? metadata.family_name : typeof metadata.last_name === 'string' ? metadata.last_name : (fullName ? fullName.split(' ').slice(1).join(' ') : '');
    const displayName = fullName || `${firstName} ${lastName}`.trim() || (authUser.email ? authUser.email.split('@')[0] : authUser.phone || 'User');
    const avatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : typeof metadata.picture === 'string' ? metadata.picture : null;

    const email = authUser.email?.toLowerCase() || (authUser.phone ? `${authUser.phone}@phone.cpilancers.local` : '');

    const { data: newUser, error: insertUserError } = await adminSupabase
      .from('users')
      .insert({
        id: authUser.id,
        email,
        role: assignedRole,
        status: 'active',
        is_email_verified: !!authUser.email,
        phone_number: authUser.phone || null,
      })
      .select('*')
      .single();

    if (insertUserError || !newUser) {
      console.error('[AuthService.ensureUserRecords - Insert User]:', errorMetadata(insertUserError));
      // Concurrent insert fallback check
      const { data: retryUser } = await adminSupabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (retryUser) {
        return { user: retryUser as User, isNew: false };
      }
      throw new AppError('Failed to create user record', 500);
    }

    await adminSupabase.from('profiles').insert({
      user_id: authUser.id,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      avatar_url: avatarUrl,
      timezone: 'UTC',
      country_code: 'US',
    });

    return { user: newUser as User, isNew: true };
  }

  /**
   * Update user last login timestamp
   */
  static async updateLastLogin(userId: string): Promise<void> {
    try {
      const adminSupabase = createAdminClient();
      await adminSupabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userId);
    } catch (err) {
      console.error('[AuthService.updateLastLogin]:', err);
    }
  }
}
