import type { NextConfig } from "next";

/**
 * F-02 — security response headers.
 *
 * The CSP below is ENFORCED in production builds (`Content-Security-Policy`) and
 * report-only under `next dev` (`Content-Security-Policy-Report-Only`), so that a
 * local dev server is never blocked by a policy it cannot satisfy. See
 * SECURITY_REMEDIATION_F02_REPORT.md for the violation analysis that informed
 * every source listed here.
 *
 * Every source is derived from something the application actually loads:
 *   - 'self'                  all routes, /api, /landing-assets, _next assets
 *   - *.supabase.co           auth, REST and Realtime (from NEXT_PUBLIC_SUPABASE_URL)
 *   - fonts.googleapis/gstatic  the Inter family @imported by src/app/globals.css
 *   - data:/blob:             inline image previews and next/image object URLs
 * There are no third-party scripts, analytics or CDNs in this application.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

/** True during `next build`, false during `next dev`. Decides enforced vs report-only. */
const isProduction = process.env.NODE_ENV === "production";

/** Only the origin (scheme + host) of the Supabase project, for CSP matching. */
const supabaseOrigin = /^https?:\/\/[^/]+/.exec(supabaseUrl)?.[0] ?? "";

const connectSrc = supabaseOrigin
  ? `'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}`
  : "'self'";

const imgSrc = supabaseOrigin ? `'self' data: blob: ${supabaseOrigin}` : "'self' data: blob:";

/**
 * HSTS is intentionally NOT includeSubDomains/preload: there is no evidence that
 * every subdomain of the deployment is HTTPS-only, and asserting either would
 * brick any subdomain that is not. Browsers also ignore an HSTS header received
 * over plain HTTP, so this cannot affect local `http://localhost` development.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Next.js App Router emits inline bootstrap/RSC scripts, so 'unsafe-inline'
  // is a demonstrated requirement here, not a blanket weakening.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind plus next/image `fill` requires inline style attributes.
  // `https://fonts.googleapis.com` is required by src/app/globals.css, which
  // @imports the Inter family from Google Fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `img-src ${imgSrc}`,
  // `https://fonts.gstatic.com` serves the Inter woff2 files the @import pulls in.
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking: DENY. CSP `frame-ancestors 'none'` is the modern equivalent and
  // agrees with this value, so the two are never in conflict.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses no camera, microphone, geolocation, USB or payment APIs.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Production ships this policy ENFORCED.
  //
  // The header name is chosen at build time from NODE_ENV, which is 'production'
  // during `next build` and 'development' during `next dev`. Production -- the
  // only thing that is ever deployed -- is therefore always enforced; there is no
  // code path that can emit an unenforced policy in a deployed build.
  //
  // `next dev` stays report-only on purpose. React Fast Refresh evaluates strings,
  // which needs 'unsafe-eval', and that requirement is an artifact of the dev
  // toolchain rather than the application. Verified directly: the production build
  // reports ZERO policy violations without 'unsafe-eval', and the dev server is the
  // only environment where it appears. Adding it to the shipped policy would
  // weaken production to accommodate a local dev server.
  isProduction
    ? { key: "Content-Security-Policy", value: contentSecurityPolicy }
    : { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
