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

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', params.email.toLowerCase())
        .single();

      if (existingUser) {
        throw new ConflictError('An account with this email already exists.');
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: params.email.toLowerCase(),
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
        console.error('[Auth Error - Register]:', authError);
        throw new AppError(authError.message, 400, 'AUTH_SIGNUP_ERROR');
      }

      if (!authData.user) {
        throw new AppError('Failed to create user account', 500);
      }

      // Use admin client to create user record with role
      // (Regular client cannot insert into users table due to RLS)
      const adminSupabase = createAdminClient();

      const { error: userError } = await adminSupabase.from('users').insert({
        id: authData.user.id,
        email: params.email.toLowerCase(),
        role: params.role,
        status: 'active',
        is_email_verified: false,
      });

      if (userError) {
        console.error('[DB Error - Create User]:', userError);
        // Attempt cleanup of auth user if DB insert fails
        await adminSupabase.auth.admin.deleteUser(authData.user.id);
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
        console.error('[DB Error - Create Profile]:', profileError);
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
