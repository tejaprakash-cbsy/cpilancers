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

export function getRegisterFieldErrors(
  data: unknown
): Partial<Record<keyof RegisterFormData, string>> {
  const result = registerSchema.safeParse(data);
  if (result.success) return {};

  return result.error.issues.reduce<Partial<Record<keyof RegisterFormData, string>>>(
    (errors, issue) => {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field as keyof RegisterFormData]) {
        errors[field as keyof RegisterFormData] = issue.message;
      }
      return errors;
    },
    {},
  );
}

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

/**
 * Phone E.164 format validation (+ followed by 1 to 14 digits)
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{1,14}$/, 'Please enter a valid phone number with country code (e.g. +1234567890, +919876543210)');

/**
 * 6-digit verification code schema
 */
export const otpTokenSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Verification code must be 6 digits');

/**
 * Email OTP Schemas
 */
export const emailOtpSendSchema = z.object({
  email: emailSchema,
});

export type EmailOtpSendFormData = z.infer<typeof emailOtpSendSchema>;

export const emailOtpVerifySchema = z.object({
  email: emailSchema,
  token: otpTokenSchema,
});

export type EmailOtpVerifyFormData = z.infer<typeof emailOtpVerifySchema>;

/**
 * Phone OTP Schemas
 */
export const phoneOtpSendSchema = z.object({
  phone: phoneSchema,
});

export type PhoneOtpSendFormData = z.infer<typeof phoneOtpSendSchema>;

export const phoneOtpVerifySchema = z.object({
  phone: phoneSchema,
  token: otpTokenSchema,
});

export type PhoneOtpVerifyFormData = z.infer<typeof phoneOtpVerifySchema>;

/**
 * OTP Request Schema (Server API)
 */
export const otpRequestSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('email'),
    email: emailSchema,
    role: z.enum(['client', 'consultant']).optional(),
  }),
  z.object({
    channel: z.literal('phone'),
    phone: phoneSchema,
    role: z.enum(['client', 'consultant']).optional(),
  }),
]);

export type OtpRequestData = z.infer<typeof otpRequestSchema>;

/**
 * OTP Verify Schema (Server API)
 */
export const otpVerifySchema = z
  .object({
    channel: z.enum(['email', 'phone']),
    identifier: z.string().trim().min(1, 'Identifier is required'),
    token: otpTokenSchema,
    role: z.enum(['client', 'consultant']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'email') {
      const emailResult = emailSchema.safeParse(data.identifier);
      if (!emailResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a valid email address',
          path: ['identifier'],
        });
      }
    } else if (data.channel === 'phone') {
      const phoneResult = phoneSchema.safeParse(data.identifier);
      if (!phoneResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a valid phone number with country code (e.g. +1234567890)',
          path: ['identifier'],
        });
      }
    }
  });

export type OtpVerifyData = z.infer<typeof otpVerifySchema>;


