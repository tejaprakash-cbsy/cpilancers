import { createClient } from '@supabase/supabase-js';

// Server-only. Never expose SUPABASE_SECRET_KEY or the legacy service key to clients.
export function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error('Missing Supabase secret key or URL for admin client.');
  }

  // New sb_secret_* keys are opaque API keys, not JWTs. The supabase-js
  // fallback adds the project key as Authorization: Bearer when no user
  // token exists, so remove only that synthetic header and keep `apikey`.
  const apiKeyOnlyFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get('authorization') === `Bearer ${secretKey}`) {
      headers.delete('authorization');
    }
    return fetch(input, { ...init, headers });
  };

  return createClient(supabaseUrl, secretKey, {
    global: {
      fetch: apiKeyOnlyFetch,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
