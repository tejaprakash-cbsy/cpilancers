import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  createAdminClient as createServerAdminClient,
  createContextClient,
  verifyCredentials,
} from '@supabase/server/core';
import type { AuthModeWithKey, SupabaseContext, SupabaseEnv } from '@supabase/server';

let cachedJwks: SupabaseEnv['jwks'] = null;

async function getJwks(url: string): Promise<SupabaseEnv['jwks']> {
  if (cachedJwks) return cachedJwks;
  const response = await fetch(process.env.SUPABASE_JWKS_URL || `${url}/auth/v1/.well-known/jwks.json`, { cache: 'force-cache' });
  if (!response.ok) return null;
  cachedJwks = await response.json() as SupabaseEnv['jwks'];
  return cachedJwks;
}

function resolveEnv(): Partial<SupabaseEnv> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    url,
    publishableKeys: publishableKey ? { default: publishableKey } : {},
    secretKeys: secretKey ? { default: secretKey } : {},
  };
}

export async function createVerifiedSupabaseContext(
  options: { auth?: AuthModeWithKey | AuthModeWithKey[] } = { auth: 'user' },
): Promise<{ data: SupabaseContext; error: null } | { data: null; error: Error }> {
  const resolved = resolveEnv();
  if (!resolved.url || !resolved.publishableKeys?.default) return { data: null, error: new Error('Supabase server configuration is incomplete.') };

  const cookieStore = await cookies();
  const ssrClient = createServerClient(resolved.url, resolved.publishableKeys.default, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options: cookieOptions }) => cookieStore.set(name, value, cookieOptions)); } catch { /* middleware owns rotation */ }
      },
    },
  });
  const { data: sessionData } = await ssrClient.auth.getSession();
  const auth = await verifyCredentials(
    { token: sessionData.session?.access_token ?? null, apikey: null },
    { auth: options.auth ?? 'user', env: { ...resolved, jwks: await getJwks(resolved.url) } },
  );
  if (auth.error || !auth.data) return { data: null, error: auth.error || new Error('Supabase authentication failed.') };
  const env = { ...resolved, jwks: await getJwks(resolved.url) };
  return {
    data: {
      supabase: createContextClient({ auth: { token: auth.data.token }, env }),
      supabaseAdmin: createServerAdminClient({ env }),
      userClaims: auth.data.userClaims,
      jwtClaims: auth.data.jwtClaims,
      authMode: auth.data.authMode,
    },
    error: null,
  };
}
