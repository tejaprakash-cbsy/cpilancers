import { z } from 'zod';

const envSchema = z.object({
  // App
  NEXT_PUBLIC_APP_NAME: z.string().default('SAP Integration Marketplace'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_JWKS_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, 'Supabase URL is required'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Razorpay (Stage 10 payment provider)
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Stripe (pre-Stage 10, retained for rollback only; unused by the payment path)
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Email
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@sapintegration.com'),
  /**
   * SendGrid suppression (ASM) group id.
   *
   * Optional. Suppression groups are account-specific: group ids are sequential
   * per SendGrid account and "1" does not exist on a fresh one, so a hardcoded
   * value makes every send fail with a 400. When unset, no `asm` block is sent at
   * all, which SendGrid accepts; transactional mail then relies on the account's
   * own list-management settings rather than a per-message unsubscribe group.
   *
   * Validated as a positive integer when present so a typo fails at
   * configuration time rather than turning into a per-send provider error.
   */
  SENDGRID_ASM_GROUP_ID: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return undefined;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('SENDGRID_ASM_GROUP_ID must be a positive integer SendGrid group id.');
      }
      return parsed;
    }),

  // Feature Flags
  NEXT_PUBLIC_ENABLE_REGISTRATION: z.string().default('true').transform((val) => val === 'true'),
  NEXT_PUBLIC_ENABLE_MESSAGING: z.string().default('true').transform((val) => val === 'true'),

});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  // Check if we are running in browser or server
  const isServer = typeof window === 'undefined';

  const clientEnv = {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'SAP Integration Marketplace',
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'),
    NODE_ENV: (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'development',
    SUPABASE_URL: undefined,
    SUPABASE_PUBLISHABLE_KEY: undefined,
    SUPABASE_SECRET_KEY: undefined,
    SUPABASE_JWKS_URL: undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'placeholder-anon-key',
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    NEXT_PUBLIC_ENABLE_REGISTRATION: process.env.NEXT_PUBLIC_ENABLE_REGISTRATION || 'true',
    NEXT_PUBLIC_ENABLE_MESSAGING: process.env.NEXT_PUBLIC_ENABLE_MESSAGING || 'true',
    EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@sapintegration.com',
  };

  if (!isServer) {
    return clientEnv as unknown as Env;
  }

  const serverEnv = {
    ...clientEnv,
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    // Server-only. A suppression group id is account-scoped configuration, not a
    // browser-facing value, so it is deliberately absent from `clientEnv`.
    SENDGRID_ASM_GROUP_ID: process.env.SENDGRID_ASM_GROUP_ID,
  };

  const parsed = envSchema.safeParse(serverEnv);

  if (!parsed.success) {
    console.warn(
      '⚠️ Invalid environment variables:',
      JSON.stringify(parsed.error.format(), null, 2)
    );
    // Return sanitized defaults during build/test phase
    return serverEnv as unknown as Env;
  }

  return parsed.data;
}

export const env = validateEnv();
