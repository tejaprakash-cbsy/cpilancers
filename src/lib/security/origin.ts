/**
 * F-04 — Origin validation for state-changing requests (defense in depth).
 *
 * ## Why Origin and not a CSRF token
 *
 * F-01 already sets `SameSite=Lax` on the session cookie, so a browser will not
 * attach it to a cross-site POST. This check is the second, independent layer:
 * it also covers the case Phase 1 demonstrated, where a manually constructed
 * request carrying the cookie was accepted. A full synchronizer-token system is
 * not warranted for a JSON API whose session lives in a `SameSite=Lax` cookie,
 * and adding one would mean threading a token through every client fetch.
 *
 * ## Trusted origin
 *
 * The trusted origin is `NEXT_PUBLIC_APP_URL`, which `src/config/env.ts` already
 * validates as a URL and which the codebase already uses for the auth callback
 * link. It is server configuration. `Host`, `X-Forwarded-Host` and the request's
 * own URL are deliberately NOT consulted: they are supplied by the client and an
 * attacker who controls them would simply declare themselves trusted.
 *
 * Comparison is on the parsed, normalized origin (`URL.origin`), so scheme and
 * host are lower-cased and default ports are collapsed. That makes it immune to
 * the suffix tricks (`https://cpilancers.com.evil.example`,
 * `https://evil-cpilancers.com`) that a substring or `endsWith` check would
 * wrongly accept, and it requires an exact scheme+host+port match.
 */

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Path prefixes whose callers legitimately send no Origin and authenticate differently. */
const ORIGIN_EXEMPT_PATHS = ['/api/payments/webhook'];

export function isUnsafeMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase());
}

/**
 * Resolve the configured trusted origin, or `null` when it is absent/unparseable.
 *
 * A `null` return is deliberately fail-CLOSED: see {@link evaluateOrigin}.
 */
export function trustedOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

export type OriginDecision =
  | { allow: true; reason: 'safe-method' | 'exempt-path' | 'origin-absent' | 'origin-trusted' }
  | { allow: false; reason: 'origin-untrusted' | 'origin-malformed' | 'origin-unconfigured' };

/**
 * Decide whether a request may proceed.
 *
 * `origin` is the raw `Origin` header value, or `null` when the header is absent.
 */
export function evaluateOrigin(method: string, pathname: string, origin: string | null): OriginDecision {
  if (!isUnsafeMethod(method)) return { allow: true, reason: 'safe-method' };
  if (ORIGIN_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return { allow: true, reason: 'exempt-path' };
  }
  // Absent Origin: server-to-server callers, native clients and some proxies send
  // none. Requiring it would break legitimate traffic, so absence is allowed.
  if (origin === null) return { allow: true, reason: 'origin-absent' };

  const expected = trustedOrigin();
  // Fail closed. If the deployment origin is not configured we cannot decide what
  // is trusted, so a browser-style request carrying an Origin is refused rather
  // than waved through.
  if (expected === null) return { allow: false, reason: 'origin-unconfigured' };

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    // Covers the literal string "null" (opaque origin) and any malformed value.
    return { allow: false, reason: 'origin-malformed' };
  }

  if (parsed.origin === expected) return { allow: true, reason: 'origin-trusted' };
  return { allow: false, reason: 'origin-untrusted' };
}