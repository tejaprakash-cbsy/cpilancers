/**
 * Authentication Form Validation Schemas
 * Using Zod for type-safe validation
 */

import { z } from 'zod';

// Password requirements
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Email validation
const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .toLowerCase();

// Name validation
const nameSchema = z
  .string()
  .min(2, 'Must be at least 2 characters')
  .max(50, 'Must be less than 50 characters')
  .regex(/^[a-zA-Z\s'-]+$/, 'Only letters, spaces, hyphens, and apostrophes allowed');

/**
 * Registration Form Schema
 */
export const registerSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    role: z.enum(['client', 'consultant']),
    agreeToTerms: z.boolean().refine((val) => val === true, {
      message: 'You must agree to the Terms of Service and Privacy Policy',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Login Form Schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Forgot Password Schema
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset Password Schema
 */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
