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

    // Stripe
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;

    // Email
    SENDGRID_API_KEY: string;
    EMAIL_FROM: string;

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
