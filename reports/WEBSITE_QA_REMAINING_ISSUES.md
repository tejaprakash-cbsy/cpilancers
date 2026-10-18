# CPI Lancers - QA Remaining Issues & Accepted Limitations

**Last Updated**: 15 October 2026<br />
**Context**: Free Community Forum Launch Phase

---

## 1. Unresolved Launch Blockers
*None. All verified launch-blocking defects in the forum workflow, session handling, navigation, and build pipeline have been remediated and regression tested.*

---

## 2. Accepted Operational Risks & Limitations

### 1. In-Memory Process-Local Rate Limiting
- **Observation**: Forum discussion and reply rate limits are maintained in-memory per Node.js server process rather than an external distributed Redis store (Upstash credentials are not provisioned in the current environment).
- **Accepted Risk**: If the application is deployed behind multiple horizontal container instances, rate limits apply per container instance rather than globally.
- **Remediation Path**: Provision Upstash Redis credentials (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) when scaling beyond a single server instance.

### 2. Remote Supabase Realtime Publication (`messages` table)
- **Observation**: The remote Supabase instance lacks `messages` in the `supabase_realtime` publication, causing websocket connections to report `CHANNEL_ERROR` and fall back to polling.
- **Accepted Risk**: Private messaging is deferred from the Free Community Forum launch scope and is not accessible to standard visitors. Core forum functionality uses standard HTTP request/response patterns and is completely unaffected.
- **Remediation Path**: When marketplace messaging is scheduled for activation, apply `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;` to the remote Supabase database with explicit stakeholder approval.

### 3. Remote Supabase Auth Email Confirmation Quota
- **Observation**: Rapid repeated account creation can encounter Supabase's default email service rate limit (HTTP 429).
- **Accepted Risk**: Standard public users registering individually will not encounter this limitation under ordinary user acquisition flows.
- **Remediation Path**: Configure custom production SMTP (SendGrid, Resend, or AWS SES) in the Supabase project dashboard for high-volume email throughput.

### 4. Marketplace Monetization Deferral
- **Observation**: Live Razorpay credentials (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) are intentionally omitted from production environment variables.
- **Status**: By design for the 15 October 2026 launch. The application operates under `MockPaymentProvider` in test suites; zero platform fees, escrow, or charges are collected from community users.

### 5. Consultant Profile Listing Exemption
- **Observation**: The `/consultants` page displays a notice that consultant directory search is not exposed as a public list endpoint.
- **Status**: By design to protect freelancer contact details and prevent bulk data scraping.

### 6. Production Domain Cutover Pending Authorization
- **Observation**: `https://cpilancers.com` currently resolves to GoDaddy IP addresses (`76.223.105.230`, `13.248.243.5`) and serves a GoDaddy 'Launching Soon' holding page (`Server: DPS/2.0.0+sha-9ca2a95`).
- **Status**: Deployment of the verified Next.js production build and DNS cutover to `cpilancers.com` is pending explicit stakeholder authorization.
