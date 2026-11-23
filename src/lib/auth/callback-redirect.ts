/**
 * Where the callback lands when `next` is absent or cannot be trusted.
 */
export const DEFAULT_REDIRECT = '/';

/**
 * Resolve the `next` parameter to a same-origin destination (RS-01).
 *
 * ## Why this is not a `startsWith('/')` check
 *
 * The obvious guard — "must start with `/` and must not start with `//`" — is
 * not sufficient. WHATWG URL parsing treats a backslash as a path separator for
 * special schemes, so these two inputs both pass that check and still resolve
 * off-site:
 *
 *     "/\\evil.example"  ->  http://evil.example/
 *     "/\\/evil.example"  ->  http://evil.example/
 *
 * Both begin with `/`, neither begins with `//`, and both end up on the
 * attacker's origin. `isSafeNextPath` in `role-redirects` (used by the login
 * form) has exactly this gap; it is left alone here because that call site feeds
 * `router.push`, which does not re-parse the value through `new URL`. This route
 * hands the string straight to `NextResponse.redirect`, so it is decided by
 * parsing rather than by prefix inspection.
 *
 * ## The rule
 *
 * Parse the candidate against the request URL and require the resulting origin
 * to equal the request's own origin. That is the same `URL.origin` comparison
 * F-04 uses for the `Origin` header, applied here to a redirect target. Anything
 * that parses to a different origin — absolute, protocol-relative, or
 * backslash-obfuscated — falls back to {@link DEFAULT_REDIRECT}. A value that
 * does not parse at all falls back too, so a malformed input can never throw out
 * of the callback.
 *
 * This deliberately does not consult `NEXT_PUBLIC_APP_URL`: the destination must
 * stay on the origin the user actually reached, which is the request's own origin,
 * and that is what keeps local development working without a configuration
 * branch.
 */
export function safeCallbackRedirect(
  next: string | null | undefined,
  requestUrl: string
): string {
  if (!next) return DEFAULT_REDIRECT;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(requestUrl).origin;
  } catch {
    return DEFAULT_REDIRECT;
  }

  let resolved: URL;
  try {
    resolved = new URL(next, requestUrl);
  } catch {
    return DEFAULT_REDIRECT;
  }

  return resolved.origin === requestOrigin ? resolved.pathname + resolved.search + resolved.hash : DEFAULT_REDIRECT;
}
