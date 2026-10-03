/**
 * Session cookie attribute hardening (F-01).
 *
 * Supabase SSR writes the session cookie with its own defaults, which leave it
 * readable from JavaScript and transportable over plain HTTP. Both cookie writers
 * in this app (`server.ts` and `middleware.ts`) therefore normalise the options
 * through this helper so the two can never drift apart.
 *
 * What is enforced:
 *   httpOnly  true  - the browser will not expose the session to JavaScript
 *   secure    true  - HTTPS only
 *   sameSite  lax   - preserved; this is what stops cross-site POSTs
 *
 * `path`, `maxAge` and `expires` are carried through untouched so refresh and
 * session lifetime behaviour is unchanged.
 *
 * `secure` is deliberately NOT made environment-conditional. A `secure: false`
 * branch is the usual way a production deployment silently ends up with an
 * unprotected cookie. The cost is that local development must be served over
 * HTTPS; see SECURITY_REMEDIATION_F01_REPORT.md.
 */

type CookieOptionsLike = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
  priority?: string;
} | undefined;

export function hardenSessionCookieOptions<T extends CookieOptionsLike>(options: T): T {
  return {
    ...(options ?? ({} as T)),
    path: options?.path ?? '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  };
}