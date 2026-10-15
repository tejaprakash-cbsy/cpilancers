# CPI Lancers — Production Deployment Runbook

**Target Launch Date:** 15 October 2026<br />
**Target Domain:** `https://cpilancers.com` (and `https://www.cpilancers.com`)<br />
**Release Scope:** Free Community Forum Only (No live payments, escrow, or fees)<br />
**Status:** **READY FOR DEPLOYMENT (AWAITING STAKEHOLDER AUTHORIZATION)**

---

## 1. Hosting Architecture Recommendation

### Recommended Hosting Platform: **Vercel**
* **Rationale**:
  * **First-Party Compatibility**: Native zero-configuration runtime for Next.js 16 (App Router, Turbopack, React 19).
  * **Edge & Serverless Execution**: Server components and API route handlers (`/api/forum/*`, `/api/auth/*`) run as managed serverless functions with zero container or server maintenance.
  * **Automated SSL/TLS**: Automatic provisioning and renewal of Let's Encrypt certificates for `cpilancers.com` and `www.cpilancers.com`.
  * **Zero Infrastructure Overhead**: No Dockerfile, Kubernetes, or OS patch maintenance required.
  * **Instant Rollbacks**: Instant one-click rollback to prior deployment snapshots without rebuilding.
* **Alternative Considered**: Google Cloud Run (Containerized Docker). Rejected for today's launch because it requires authoring multi-stage Dockerfiles, setting up Cloud Build, Google Artifact Registry, and configuring Cloud Load Balancers/SSL certificates, introducing unnecessary operational risk for a launch today.

---

## 2. Production Environment Variables Matrix

> [!IMPORTANT]
> **Safety Rule**: Never commit secrets to the Git repository. Set these variables in the hosting provider's project settings (e.g. Vercel Project Settings → Environment Variables). Live Razorpay credentials MUST remain absent for this free release.

### Browser-Facing Variables (Client Bundle)
| Variable Name | Required Value / Purpose | Scope |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | `CPI Lancers` | Production, Preview, Dev |
| `NEXT_PUBLIC_APP_URL` | `https://cpilancers.com` | Production |
| `NEXT_PUBLIC_SUPABASE_URL` | Remote Supabase project URL (`https://uzjvaijepqfiogwncdjn.supabase.co`) | Production, Preview, Dev |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous API key for the Supabase project | Production, Preview, Dev |
| `NEXT_PUBLIC_ENABLE_REGISTRATION` | `true` | Production, Preview, Dev |
| `NEXT_PUBLIC_ENABLE_MESSAGING` | `true` | Production, Preview, Dev |

### Server-Only Variables (Secret / Sensitive)
| Variable Name | Required Value / Purpose | Scope |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role secret key (Server-only for admin operations) | Production (Never expose to browser) |
| `SENDGRID_API_KEY` | *(Optional)* SendGrid transactional email key if custom SMTP is active | Production (Server-only) |
| `EMAIL_FROM` | `noreply@cpilancers.com` | Production (Server-only) |

### Deferred Variables (MUST REMAIN ABSENT)
| Variable Name | Policy for 15 October 2026 Release |
| :--- | :--- |
| `RAZORPAY_KEY_ID` | **DO NOT SET** — Keeps live marketplace checkout deactivated |
| `RAZORPAY_KEY_SECRET` | **DO NOT SET** — Keeps live marketplace checkout deactivated |
| `RAZORPAY_WEBHOOK_SECRET` | **DO NOT SET** — Keeps live marketplace checkout deactivated |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | **DO NOT SET** — Keeps live marketplace checkout deactivated |

---

## 3. Exact DNS Configuration (GoDaddy Registrar)

Current DNS state at GoDaddy nameservers (`ns07.domaincontrol.com`, `ns08.domaincontrol.com`):
* Current `A` records point to GoDaddy parking (`76.223.105.230`, `13.248.243.5`).
* Current `MX` records handle domain email (`mailstore1.secureserver.net`, `smtp.secureserver.net`).
* Current `TXT` record contains SPF (`v=spf1 include:secureserver.net -all`).

### Required DNS Changes for Vercel:

| Action | Type | Name / Host | Value / Target | TTL | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **UPDATE** | `A` | `@` | `76.76.21.21` | 600 (or 3600) | Replaces GoDaddy parking IPs (`76.223.105.230`, `13.248.243.5`) |
| **UPDATE** | `CNAME` | `www` | `cname.vercel-dns.com.` | 600 (or 3600) | Points `www.cpilancers.com` to Vercel edge network |
| **PRESERVE** | `MX` | `@` | `mailstore1.secureserver.net` (10) | Current | **DO NOT MODIFY** (Preserves existing email routing) |
| **PRESERVE** | `MX` | `@` | `smtp.secureserver.net` (0) | Current | **DO NOT MODIFY** (Preserves existing email routing) |
| **PRESERVE** | `TXT` | `@` | `v=spf1 include:secureserver.net -all` | Current | **DO NOT MODIFY** (Preserves existing SPF authorization) |

---

## 4. Remote Supabase Authentication Configuration

In the remote Supabase project dashboard (`uzjvaijepqfiogwncdjn`):
1. Navigate to **Authentication** → **URL Configuration**.
2. Set **Site URL**:
   * `https://cpilancers.com`
3. Add to **Redirect URLs (Allow List)**:
   * `https://cpilancers.com/**`
   * `https://cpilancers.com/auth/callback`
   * `https://cpilancers.com/login`
   * `https://www.cpilancers.com/**`
   * `https://www.cpilancers.com/auth/callback`
   * `http://localhost:3000/**` (retained for isolated testing)

---

## 5. Step-by-Step Deployment Instructions

### Method A: Deploy via Vercel CLI (Recommended)
1. In the repository root (`sap-integration-marketplace`):
   ```bash
   npx vercel login
   ```
2. Link the project:
   ```bash
   npx vercel link
   ```
3. Set the production environment variables (using Vercel CLI or Dashboard):
   ```bash
   npx vercel env add NEXT_PUBLIC_APP_URL production
   npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
   npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
   ```
4. Deploy to production:
   ```bash
   npx vercel --prod
   ```
5. Assign domain:
   * In Vercel Project Settings → Domains, add `cpilancers.com` and `www.cpilancers.com`.
   * Complete DNS record updates in GoDaddy as detailed in Section 3.

### Method B: Deploy via Vercel Dashboard (GitHub Integration)
1. Push local changes to GitHub `origin/master` (once authorized).
2. In the Vercel Dashboard, select **Add New** → **Project** → Import `cpilancers`.
3. Set Root Directory to `sap-integration-marketplace`.
4. Add the environment variables from Section 2.
5. Click **Deploy**.
6. Add `cpilancers.com` in Domains settings.

---

## 6. Post-Deployment Production Smoke Tests

Once DNS has propagated and HTTPS is active at `https://cpilancers.com`:
1. **Connectivity & HTTPS Check**:
   ```bash
   curl.exe -Iv https://cpilancers.com/
   ```
   *Verify HTTP 200, valid SSL certificate, HSTS, CSP, and X-Frame-Options: DENY.*
2. **Forum Listing & Categories**:
   ```bash
   curl.exe -Iv https://cpilancers.com/forum
   ```
   *Verify all 9 categories load from Supabase.*
3. **Authentication & Session Persistence**:
   * Open `https://cpilancers.com/login` in an incognito browser.
   * Log in with test account. Verify redirect to `/dashboard/client` or role destination.
   * Verify session cookies are set with `HttpOnly`, `SameSite`, and `Secure`.
4. **Create Discussion**:
   * Visit `https://cpilancers.com/forum/new`.
   * Create a new topic in "SAP & Integration".
   * Verify the discussion appears in `/forum` and on the homepage live discussions strip.
5. **Create Reply**:
   * Post a reply to the newly created discussion.
   * Verify the reply renders and the discussion counter updates.
6. **Rate Limiting Check**:
   * Attempt to create rapid consecutive topics; verify HTTP 429 is returned after 5 topics.
7. **Logout Verification**:
   * Click "Log out" in the header; verify redirect to `/` and that visiting `/dashboard/client` redirects to `/login`.

---

## 7. Rollback Procedure

If an unexpected critical defect is identified after DNS cutover:
1. **Instant Application Rollback**:
   * In Vercel Dashboard → Deployments, find the previous stable deployment and click **Promote to Production** (instant zero-downtime cutover).
2. **DNS Rollback (Emergency Fallback)**:
   * If the hosting infrastructure itself fails, revert GoDaddy `A` records back to:
     * `76.223.105.230`
     * `13.248.243.5`
   * This immediately re-activates the GoDaddy holding page while issues are resolved.
3. **Database Integrity**:
   * No destructive database schema migrations were applied; remote Supabase database remains completely backward-compatible.
