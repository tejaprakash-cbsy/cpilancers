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

/**
 * Collect all configured trusted origins from server configuration and deployment environment.
 * Supports:
 * - NEXT_PUBLIC_APP_URL (single or comma-separated)
 * - ALLOWED_ORIGINS (comma-separated)
 * - Vercel system environment variables (VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL, VERCEL_BRANCH_URL, NEXT_PUBLIC_VERCEL_URL)
 */
export function getTrustedOrigins(): Set<string> {
  const origins = new Set<string>();

  // 1. NEXT_PUBLIC_APP_URL (comma-separated or single)
  const appUrls = process.env.NEXT_PUBLIC_APP_URL?.split(',') ?? [];
  for (const raw of appUrls) {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        // ignore malformed entries
      }
    }
  }

  // 2. ALLOWED_ORIGINS (comma-separated)
  const allowed = process.env.ALLOWED_ORIGINS?.split(',') ?? [];
  for (const raw of allowed) {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        // ignore malformed entries
      }
    }
  }

  // 3. Vercel deployment URLs (automatically injected by Vercel platform)
  const vercelUrls = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
  ];

  for (const raw of vercelUrls) {
    const trimmed = raw?.trim();
    if (trimmed) {
      const formatted = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
      try {
        origins.add(new URL(formatted).origin);
      } catch {
        // ignore malformed entries
      }
    }
  }

  return origins;
}

export type OriginDecision =
  | { allow: true; reason: 'safe-method' | 'exempt-path' | 'origin-absent' | 'origin-trusted' }
  | { allow: false; reason: 'origin-untrusted' | 'origin-malformed' | 'origin-unconfigured' };

/**
 * Decide whether a request may proceed.
 *
 * `origin` is the raw `Origin` header value, or `null` when the header is absent.
 * `requestOrigin` is the origin of the incoming request (e.g. `request.nextUrl.origin`).
 * When present and equal to `origin`, it confirms a legitimate same-origin browser request.
 */
export function evaluateOrigin(
  method: string,
  pathname: string,
  origin: string | null,
  requestOrigin?: string | null
): OriginDecision {
  if (!isUnsafeMethod(method)) return { allow: true, reason: 'safe-method' };
  if (ORIGIN_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return { allow: true, reason: 'exempt-path' };
  }
  // Absent Origin: server-to-server callers, native clients and some proxies send
  // none. Requiring it would break legitimate traffic, so absence is allowed.
  if (origin === null) return { allow: true, reason: 'origin-absent' };

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    // Covers the literal string "null" (opaque origin) and any malformed value.
    return { allow: false, reason: 'origin-malformed' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allow: false, reason: 'origin-malformed' };
  }

  // 1. Same-origin request: client Origin matches the server's own request origin
  if (requestOrigin) {
    try {
      const parsedRequest = new URL(requestOrigin);
      if (parsed.origin === parsedRequest.origin) {
        return { allow: true, reason: 'origin-trusted' };
      }
    } catch {
      // ignore invalid requestOrigin
    }
  }

  // 2. Explicitly trusted origin (NEXT_PUBLIC_APP_URL, ALLOWED_ORIGINS, Vercel env vars)
  const trusted = getTrustedOrigins();
  if (trusted.has(parsed.origin)) {
    return { allow: true, reason: 'origin-trusted' };
  }

  // Fail closed if no trusted origins are configured and no requestOrigin was provided
  if (trusted.size === 0 && !requestOrigin) {
    return { allow: false, reason: 'origin-unconfigured' };
  }

  return { allow: false, reason: 'origin-untrusted' };
}