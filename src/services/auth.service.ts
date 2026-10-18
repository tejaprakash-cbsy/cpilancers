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

function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

function errorMetadata(error: { code?: string; status?: number } | null | undefined) {
  return {
    code: error?.code ?? 'unknown',
    status: error?.status,
  };
}

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
          emailRedirectTo: `${getAppUrl()}/auth/callback`,
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
        // Don't reveal if email exists or not for security
        // Just return success
      }

      return { success: true };
    } catch (error) {
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
          emailRedirectTo: `${getAppUrl()}/auth/callback`,
        },
      });

      if (error) {
        console.error('[Auth Error - Resend Verification]:', error);
        throw new AppError('Failed to resend verification email', 400);
      }

      return { success: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[AuthService.resendVerificationEmail]:', error);
      throw new AppError('Failed to resend verification email', 500);
    }
  }
}
