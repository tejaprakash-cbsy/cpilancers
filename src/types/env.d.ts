/**
 * Environment Variables Type Definitions
 * Ensures type safety for environment variables throughout the application
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // App Configuration
    NEXT_PUBLIC_APP_NAME: string;
    NEXT_PUBLIC_APP_URL: string;
    NODE_ENV: 'development' | 'production' | 'test';

    // Supabase
    SUPABASE_URL: string;
    SUPABASE_PUBLISHABLE_KEY: string;
    SUPABASE_SECRET_KEY: string;
    SUPABASE_JWKS_URL: string;
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY: string;

    // Razorpay (Stage 10 payment provider)
    NEXT_PUBLIC_RAZORPAY_KEY_ID: string;
    RAZORPAY_KEY_ID: string;
    RAZORPAY_KEY_SECRET: string;
    RAZORPAY_WEBHOOK_SECRET: string;

    // Stripe (pre-Stage 10). Retained for rollback only; the Stage 10 payment
    // path never reads these. See migrations/00009_payments_stage10.sql.
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;

    // Email
    SENDGRID_API_KEY: string;
    EMAIL_FROM: string;
    // Server-only SendGrid suppression (ASM) group id. Optional; when unset no
    // `asm` block is sent. Never a NEXT_PUBLIC_ value.
    SENDGRID_ASM_GROUP_ID?: string;

    // Feature Flags
    NEXT_PUBLIC_ENABLE_REGISTRATION: string;
    NEXT_PUBLIC_ENABLE_MESSAGING: string;

    // Admin
    ADMIN_EMAILS: string;

    // Sentry (Optional)
    NEXT_PUBLIC_SENTRY_DSN?: string;
    SENTRY_AUTH_TOKEN?: string;
  }
}
