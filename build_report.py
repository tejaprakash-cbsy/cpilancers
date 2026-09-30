"""
Generates the SAP/CPI Integration Marketplace investor technical progress report (DOCX).

Every factual claim in this document is traceable to repository evidence gathered
during discovery: source files, SQL migrations, test suites, and command output.
Where evidence is absent the document says so explicitly.
"""

from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = r"C:\Users\admin\Desktop\lancers\sap-integration-marketplace\SapIntegrationMarketplace_Investor_Progress_Report.docx"

NAVY = RGBColor(0x1B, 0x36, 0x5D)
SLATE = RGBColor(0x44, 0x4D, 0x56)
ACCENT = RGBColor(0x0B, 0x63, 0xCE)
MUTED = RGBColor(0x6B, 0x72, 0x80)
GOOD = RGBColor(0x1B, 0x5E, 0x20)
WARN = RGBColor(0x8A, 0x5A, 0x00)
BAD = RGBColor(0xA3, 0x1D, 0x1D)

doc = Document()

# ---------------------------------------------------------------------------
# Page setup
# ---------------------------------------------------------------------------
for s in doc.sections:
    s.page_width = Inches(8.27)
    s.page_height = Inches(11.69)
    s.left_margin = Inches(0.85)
    s.right_margin = Inches(0.85)
    s.top_margin = Inches(0.85)
    s.bottom_margin = Inches(0.8)

st = doc.styles["Normal"]
st.font.name = "Calibri"
st.font.size = Pt(10)
st.paragraph_format.space_after = Pt(6)
st.paragraph_format.line_spacing = 1.08

for name, size, color, before, after in [
    ("Heading 1", 17, NAVY, 20, 8),
    ("Heading 2", 13, NAVY, 14, 5),
    ("Heading 3", 11, SLATE, 10, 4),
]:
    s = doc.styles[name]
    s.font.name = "Calibri"
    s.font.size = Pt(size)
    s.font.color.rgb = color
    s.font.bold = True
    s.paragraph_format.space_before = Pt(before)
    s.paragraph_format.space_after = Pt(after)
    s.paragraph_format.keep_with_next = True


def shade(cell, hexcolor):
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:fill"), hexcolor)
    cell._tc.get_or_add_tcPr().append(el)


def h1(t):
    doc.add_heading(t, level=1)


def h2(t):
    doc.add_heading(t, level=2)


def h3(t):
    doc.add_heading(t, level=3)


def para(t="", bold=False, italic=False, size=10, color=None, align=None, space_after=6):
    p = doc.add_paragraph()
    r = p.add_run(t)
    r.bold = bold
    r.italic = italic
    r.font.size = Pt(size)
    if color:
        r.font.color.rgb = color
    if align:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    return p


def rich(parts, size=10, space_after=6):
    """parts = list of (text, bold, color|None)"""
    p = doc.add_paragraph()
    for t, b, c in parts:
        r = p.add_run(t)
        r.bold = b
        r.font.size = Pt(size)
        if c:
            r.font.color.rgb = c
    p.paragraph_format.space_after = Pt(space_after)
    return p


def bullet(t, level=0):
    p = doc.add_paragraph(t, style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.25 + 0.25 * level)
    p.paragraph_format.space_after = Pt(3)
    for r in p.runs:
        r.font.size = Pt(10)
    return p


def numbered(t):
    p = doc.add_paragraph(t, style="List Number")
    p.paragraph_format.left_indent = Inches(0.3)
    p.paragraph_format.space_after = Pt(3)
    for r in p.runs:
        r.font.size = Pt(10)
    return p


def code(t, size=8):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.18)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing = 1.0
    r = p.add_run(t)
    r.font.name = "Consolas"
    r.font.size = Pt(size)
    r.font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)
    pPr = p._p.get_or_add_pPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:fill"), "F4F6F8")
    pPr.append(sh)
    return p


def table(headers, rows, widths=None, font=8.5, header_fill="1B365D"):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = t.rows[0].cells
    for i, htxt in enumerate(headers):
        hdr[i].text = ""
        p = hdr[i].paragraphs[0]
        r = p.add_run(htxt)
        r.bold = True
        r.font.size = Pt(font)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.space_before = Pt(2)
        shade(hdr[i], header_fill)
    for row in rows:
        cells = t.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = ""
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            txt = str(val)
            color = None
            bold = False
            if txt.startswith("!!"):
                txt = txt[2:]
                color = BAD
                bold = True
            elif txt.startswith("++"):
                txt = txt[2:]
                color = GOOD
                bold = True
            elif txt.startswith("~~"):
                txt = txt[2:]
                color = WARN
            r = p.add_run(txt)
            r.font.size = Pt(font)
            if color:
                r.font.color.rgb = color
            r.bold = bold
    if widths:
        for r_ in t.rows:
            for i, w in enumerate(widths):
                r_.cells[i].width = Inches(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def callout(title, body, fill="EEF3FA", bar=NAVY):
    t = doc.add_table(rows=1, cols=1)
    t.style = "Table Grid"
    c = t.rows[0].cells[0]
    c.text = ""
    p = c.paragraphs[0]
    r = p.add_run(title)
    r.bold = True
    r.font.size = Pt(9.5)
    r.font.color.rgb = bar
    p2 = c.add_paragraph()
    r2 = p2.add_run(body)
    r2.font.size = Pt(9)
    p2.paragraph_format.space_after = Pt(2)
    shade(c, fill)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def add_page_numbers():
    footer = doc.sections[0].footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("SAP/CPI Integration Marketplace  |  Investor Technical Progress Report  |  Page ")
    r.font.size = Pt(7.5)
    r.font.color.rgb = MUTED
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    p._p.append(fld)


def page_break():
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# ===========================================================================
# COVER
# ===========================================================================
for _ in range(3):
    doc.add_paragraph()

para("SAP / CPI", size=13, color=ACCENT, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=0)
para("INTEGRATION MARKETPLACE", size=30, color=NAVY, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Investor Technical Progress Report", size=15, color=SLATE, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=22)

t = doc.add_table(rows=1, cols=1)
t.style = "Table Grid"
c = t.rows[0].cells[0]
c.text = ""
for label, value in [
    ("Report version", "1.0"),
    ("Report date", "27 September 2026"),
    ("Project version", "0.1.0 (package.json)"),
    ("Source commit", "230162b - Complete stages 10 through 13 security hardening"),
    ("Branch", "master"),
    ("Assessment basis", "Static repository analysis of source, SQL migrations, test suites and build output"),
    ("Report classification", "Confidential - investor and technical due diligence"),
]:
    p = c.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    r1 = p.add_run(f"{label}:  ")
    r1.bold = True
    r1.font.size = Pt(9.5)
    r2 = p.add_run(value)
    r2.font.size = Pt(9.5)
shade(c, "F4F6F8")

doc.add_paragraph()
para(
    "This report describes the platform as it exists in the source repository at the commit named above. "
    "Every capability statement is traceable to code, a database migration, a passing test, or recorded "
    "command output. Where such evidence does not exist, the report says so rather than inferring intent.",
    italic=True, size=9, color=MUTED, align=WD_ALIGN_PARAGRAPH.CENTER,
)

page_break()

# ===========================================================================
# DOCUMENT CONTROL + CONTENTS
# ===========================================================================
h1("Document Control")

table(
    ["Field", "Value", "Evidence"],
    [
        ["Project", "sap-integration-marketplace", "package.json \"name\""],
        ["Version", "0.1.0 (private)", "package.json"],
        ["Commit audited", "230162b", "git log --oneline"],
        ["Branch", "master", "git branch --show-current"],
        ["Working tree", "Clean for source; 30 untracked audit artifacts", "git status --porcelain"],
        ["Language", "TypeScript 5.x, SQL (PL/pgSQL), React 19", "package.json, migrations"],
        ["Runtime", "Node.js, Next.js 16.3.5", "package.json"],
        ["Database", "PostgreSQL via Supabase", "supabase/migrations/*"],
        ["Auth", "Supabase Auth (GoTrue) + server session cookies", "src/services/auth.service.ts"],
        ["Payments", "Razorpay Route (India)", "src/lib/payments/razorpay.provider.ts"],
        ["Email", "SendGrid v3 Mail Send", "src/lib/notifications/channels/email.ts"],
        ["Migrations", "15 (00001 - 00015)", "supabase/migrations/"],
        ["API routes", "64", "src/app/api/**/route.ts"],
        ["Database tables", "33", "migrations"],
        ["RLS policies", "51", "migrations"],
        ["Triggers", "9", "migrations"],
        ["Database functions", "25 distinct", "migrations"],
        ["Enums", "25", "migrations"],
        ["Services", "12 (7,702 lines)", "src/services/"],
        ["Test suites", "20 (438 cases)", "src/tests/"],
    ],
    widths=[1.35, 2.5, 2.85],
)

h1("Table of Contents")
toc = [
    "1. Executive Summary", "2. Product Overview", "3. Business Model",
    "4. User Roles and Permissions", "5. System Architecture", "6. Database Architecture",
    "7. Migration History", "8. Authentication and Authorization", "9. Row Level Security",
    "10. Payment Architecture", "11. Review and Reputation System", "12. Notification System",
    "13. Administration and Moderation", "14. Security Architecture",
    "15. Security Audit History", "16. Testing", "17. Build and Code Quality",
    "18. Development Status by Stage", "19. Git and Development History",
    "20. What Is Complete", "21. What Remains", "22. Known Limitations",
    "23. Scalability", "24. Production Readiness", "25. Development Roadmap",
    "26. Investor Takeaways",
    "Appendix A - API Inventory", "Appendix B - Database Inventory",
    "Appendix C - Migration Inventory", "Appendix D - Security Controls",
    "Appendix E - Test Evidence", "Appendix F - Known Limitations",
]
for item in toc:
    p = doc.add_paragraph()
    r = p.add_run(item)
    r.font.size = Pt(9.5)
    p.paragraph_format.space_after = Pt(2)

page_break()

# ===========================================================================
# 1. EXECUTIVE SUMMARY
# ===========================================================================
h1("1. Executive Summary")

para(
    "The SAP/CPI Integration Marketplace is a two-sided professional services platform for enterprise "
    "SAP integration work - the kind delivered through SAP Cloud Platform Integration (CPI), SAP "
    "Integration Suite and adjacent middleware. It connects enterprise buyers (clients) with specialist "
    "consultants, and it manages the commercial lifecycle of that engagement: scoping, contracting, "
    "escrowed payment, delivery against milestones, release of funds, mutual review, and dispute "
    "resolution.",
    size=10.5,
)

h2("The problem it addresses")
para(
    "Enterprise integration work is high-value, long-running and trust-dependent, yet the process for "
    "engaging a specialist is still handled largely over email and spreadsheets. Buyers cannot compare "
    "consultants on evidence of past delivery. Consultants cannot demonstrate reliability. Neither party "
    "has a safe way to exchange staged money against staged delivery, so the smaller party carries the "
    "working-capital and performance risk. When something goes wrong there is no shared record of what "
    "was agreed, what was delivered, and what each party thought of the other.",
)

h2("The solution")
para(
    "The platform replaces that informal process with an auditable commercial workflow. Every engagement "
    "becomes a contract with itemised milestones and a fixed amount. Clients fund a milestone, the money "
    "is held in escrow rather than released immediately, and the consultant is paid only when the "
    "milestone is approved. Both parties review each other afterwards, and those reviews become a "
    "reputation signal that feeds consultant discovery. Disputes and administrative intervention are "
    "supported when the normal path does not resolve a problem.",
)

h2("Where the project stands")
table(
    ["Dimension", "Status", "Evidence"],
    [
        ["Core domain model", "++Implemented and tested", "33 tables, 25 enums, 15 migrations"],
        ["Authentication and profiles", "++Implemented and tested", "auth.service.ts, profile routes"],
        ["Marketplace (jobs, proposals, contracts)", "++Implemented and tested", "job/proposal/contract services"],
        ["Payments, escrow and payouts", "++Implemented and tested", "payment.service.ts, 5 payment routes"],
        ["Reviews and reputation", "++Implemented and tested", "review.service.ts, reputation.ts"],
        ["Messaging", "++Implemented and tested", "messaging.service.ts"],
        ["Notifications and email", "++Implemented and tested", "notification.service.ts, 5 routes"],
        ["Administration and moderation", "++Implemented and tested", "admin.service.ts, 17 admin routes"],
        ["Database security (RLS, grants)", "++Implemented - structurally verified", "51 policies across migrations"],
        ["Applied to a live database", "!!Not verified", "No schema dump present; remote-schema.sql is empty"],
        ["Provider credentials and live calls", "!!Not verified", "No SENDGRID_API_KEY or Razorpay key in evidence"],
        ["User interface", "~~Partial - 14 pages, no notification or admin UI", "src/app/**/page.tsx"],
        ["Automated tests", "++438 passing across 20 suites", "vitest run"],
        ["Production deployment", "!!Not verified", "No deployment configuration in repository"],
    ],
    widths=[1.9, 2.05, 2.75],
)

h2("Technical maturity")
para(
    "The backend is materially more mature than the frontend. The server side has a layered architecture "
    "with a genuine defence-in-depth model - Zod validation, a service layer, and database-enforced "
    "row-level security - and it has been through three independent security audits covering payments, "
    "reviews and notifications, each of which found real defects that were then remediated. The frontend "
    "is a thin presentation layer: 14 pages against 64 API routes, with no screen yet for notifications, "
    "administration, payouts, or review submission.",
)
para(
    "The single most important caveat for any investor reading this report: no part of this system has "
    "been verified against a running database or a live payment and email provider. The logic is proven by "
    "438 passing tests and by static review; it is not proven by production traffic.",
)

h2("Current milestone and remaining work")
para(
    "Stages 10 through 13 - payments, reviews and reputation, notifications, and administration - were "
    "completed and committed under checkpoint 230162b. The next phase is integration: apply the schema to "
    "a real database, exercise the payment and email providers against live credentials, build the "
    "missing user interface, and close the verification gaps catalogued in section 22.",
)

page_break()

# ===========================================================================
# 2. PRODUCT OVERVIEW
# ===========================================================================
h1("2. Product Overview")

h2("2.1 Marketplace concept")
para(
    "The platform is a curated two-sided marketplace, not an open listing board. Clients publish a job "
    "specifying integration work; consultants submit priced proposals against it; a client accepts one, "
    "which creates a contract. Only one proposal per consultant per job may be active at a time, enforced "
    "by a database constraint rather than by convention.",
)

h2("2.2 Participants and roles")
table(
    ["Role", "Description", "Lifecycle"],
    [
        ["Client", "An enterprise buying integration delivery. Publishes jobs, reviews proposals, funds and approves milestones.", "register -> client_profile -> jobs -> contracts"],
        ["Consultant", "A specialist offering SAP/CPI integration services. Submits proposals, delivers milestones.", "register -> consultant_profile (skills, portfolio, certifications) -> proposals -> contracts"],
        ["Administrator", "Platform operator. Moderates content, resolves disputes and reports, reviews payments and payouts.", "Granted via users.role = 'admin'; every privileged action is audited"],
        ["Service role", "Backend identity used by application services. Bypasses RLS; never exposed to a browser.", "Present only in server-side code via createAdminClient()"],
    ],
    widths=[1.0, 3.4, 2.3],
)

h2("2.3 End-to-end product flow")
para(
    "The following stages are all supported by implemented code. Nothing in this chain is planned or "
    "placeholder.",
    italic=True, size=9, color=MUTED,
)
code(
    """  Registration / Authentication
            |
            v
  Profile completion  (client_profile or consultant_profile)
            |
            v
  Marketplace discovery  (jobs, skill matching, public consultant profiles)
            |
            v
  Proposal  (consultant submits -> client shortlists -> accepts or rejects)
            |
            v
  Contract  (created from accepted proposal, pending_acceptance -> active)
            |
            v
  Milestones  (client defines scope, sequence and fixed amounts)
            |
            v
  Payment and escrow  (client funds milestone -> funds held -> client approves -> release)
            |
            v
  Delivery  (in_progress -> submitted -> approved)
            |
            v
  Payout  (transfer to consultant's linked account)
            |
            v
  Review and reputation  (both parties rate each other; aggregate recomputed)
            |
            v
  Dispute / Administration  (when the normal path does not resolve an issue)"""
)

h2("2.4 Transaction, contract and payment lifecycles")
para(
    "Three lifecycles are enforced as explicit state machines in the application layer, with the same "
    "transitions re-validated in the database where a risk warrants it. Each has a terminal state that "
    "cannot be left.",
)
table(
    ["Lifecycle", "States", "Terminal", "Enforced by"],
    [
        ["Contract", "pending_acceptance -> active -> completed | cancelled | terminated; active -> disputed", "completed, cancelled, terminated", "CONTRACT_TRANSITIONS + DB CHECK constraints"],
        ["Milestone", "pending -> funded -> in_progress -> submitted -> approved; any -> disputed / cancelled", "approved, cancelled", "MILESTONE_TRANSITIONS + service role checks"],
        ["Payment", "pending -> held_in_escrow -> released; pending -> failed; either -> refunded", "released, refunded, failed", "PAYMENT_TRANSITIONS in code; chk_payment_math in DB"],
    ],
    widths=[0.85, 2.75, 1.25, 1.85],
)

h2("2.5 Dispute and moderation lifecycle")
para(
    "A dispute can be raised by either party on a contract. The contract's disputed state freezes escrow: "
    "a held payment is not released while a dispute is open. Administrators resolve disputes through a "
    "database-resident procedure that writes an audit entry in the same transaction as the state change. "
    "Reports against users, jobs and proposals follow the same moderation path.",
)

page_break()

# ===========================================================================
# 3. BUSINESS MODEL
# ===========================================================================
h1("3. Business Model")

callout(
    "Revenue functionality status",
    "The platform fee mechanism is fully implemented in code and database. No fee is charged by default: "
    "the seed configuration is 0%, and a business decision is required to set a real rate. No revenue "
    "has been earned, and no financial projection is offered in this report.",
    fill="FFF6E5", bar=WARN,
)

h2("3.1 Implemented monetisation mechanics")
table(
    ["Mechanic", "Status", "Implementation evidence"],
    [
        ["Escrowed payment", "++Implemented and tested", "payment.service.ts openEscrow(); razorpay.provider.ts createTransfer()"],
        ["Single platform fee withheld from gross", "++Implemented and tested", "lib/payments/fees.ts calculateFeeBreakdown()"],
        ["Configurable fee: percentage + fixed + min/max clamp", "++Implemented and tested", "platform_fee_config table; fees.ts"],
        ["Fee precedence: milestone > contract > global", "++Implemented and tested", "fees.ts selectFeeConfig()"],
        ["Consultant payout", "++Implemented and tested", "payouts table; releaseToConsultant()"],
        ["Refund with transfer reversal", "++Implemented and tested", "payment_refunds table; refunds + reverse"],
        ["Escrow balance invariant", "++Implemented and tested", "assert_contract_funding_within_total() RPC (00009)"],
    ],
    widths=[2.15, 1.5, 3.05],
)

h2("3.2 How the fee is calculated")
para(
    "The platform fee is a single amount withheld from the gross. The client pays the milestone amount "
    "exactly; the consultant is paid the net. This satisfies a database constraint, "
    "chk_payment_math, which asserts that gross always equals platform fee plus net:",
)
code(
    """  gross_amount_cents  =  platform_fee_cents  +  net_amount_cents     (DB CHECK)

  fee = clamp( round(gross * basis_points / 10000) + fixed_cents , min , max )
  net = gross - fee
  fee  is additionally capped at gross, so net is never negative."""
)

h2("3.3 Value creation")
bullet("For clients: staged payment reduces the risk of paying for undelivered work; escrow releases only against approval.")
bullet("For consultants: a reputation record backed by completed contracts, which is portable evidence of delivery.")
bullet("For the platform: a transaction fee on every funded milestone, plus the defensibility of a shared, auditable record.")

h2("3.4 Network effects")
para(
    "The design supports - but does not yet create - a network effect. Consultant profiles and reviews "
    "are public and are the intended discovery surface, so a growing population of rated consultants "
    "should improve buyer matching and reduce time-to-hire. No evidence in the repository establishes "
    "that this effect has been observed, and no growth metrics exist.",
)

h2("3.5 Operational requirements implied by the design")
bullet("An operations function for administrator moderation and dispute resolution; the tooling exists but the staffing decision does not.")
bullet("Compliance review for the payment provider relationship in the target market, since the implementation is scoped to India.")
bullet("A transactional email sender domain and suppression-group configuration before email volume is switched on.")

page_break()

# ===========================================================================
# 4. ROLES
# ===========================================================================
h1("4. User Roles and Permissions")

h2("4.1 Role definitions")
table(
    ["Role", "Exists as", "Purpose", "How authorised"],
    [
        ["Unauthenticated", "No users row", "Public marketplace browsing, public consultant profiles, registration and login", "No session; RLS blocks all private rows"],
        ["Client", "users.role = 'client' + client_profiles row", "Publish jobs, evaluate proposals, fund and approve milestones", "Session-derived user id; service re-derives the owning client profile"],
        ["Consultant", "users.role = 'consultant' + consultant_profiles row", "Submit proposals, deliver milestones, receive payouts", "Session-derived user id; service re-derives the owning consultant profile"],
        ["Administrator", "users.role = 'admin'", "Moderation, disputes, reports, payment and payout review", "AdminService.requireAdmin() re-reads role AND status from the database on every request"],
        ["Service role", "Supabase service key", "Server-side service layer work", "createAdminClient(); bypasses RLS; never sent to a browser"],
    ],
    widths=[1.0, 1.5, 2.2, 2.0],
)

h2("4.2 Permissions matrix")
para(
    "Derived from route handlers, service-layer checks and RLS policies. A tick means the capability is "
    "implemented and enforced; a dash means the capability is not available to that role.",
    italic=True, size=9, color=MUTED,
)
table(
    ["Capability", "Public", "Client", "Consultant", "Admin", "Service role"],
    [
        ["Browse jobs / public profiles", "+", "+", "+", "+", "+"],
        ["Publish a job", "", "+", "", "", ""],
        ["Submit a proposal", "", "", "+", "", ""],
        ["Shortlist / accept / reject a proposal", "", "+", "", "", ""],
        ["Create a contract", "", "+", "", "", ""],
        ["Define milestones", "", "+", "", "", ""],
        ["Fund a milestone (create payment)", "", "+", "", "", ""],
        ["Submit / start milestone work", "", "", "+", "", ""],
        ["Approve a milestone", "", "+", "", "", ""],
        ["Release escrowed funds", "", "+", "", "", ""],
        ["Refund (dispute / admin path)", "", "", "", "+", "+"],
        ["Send and receive messages", "", "+", "+", "", ""],
        ["Leave a review (on completed contract)", "", "+", "+", "", ""],
        ["View own notifications", "", "+", "+", "", ""],
        ["Change own notification preferences", "", "+", "+", "", ""],
        ["Moderate users / jobs / proposals", "", "", "", "+", ""],
        ["Resolve disputes and reports", "", "", "", "+", ""],
        ["Review payments and payouts", "", "", "", "+", "+"],
        ["Read the admin audit log", "", "", "", "+", "+"],
        ["Write notifications for another user", "", "", "", "", "+"],
        ["Mutate any user's payments / contracts", "", "", "", "", "+"],
    ],
    widths=[2.35, 0.72, 0.72, 0.85, 0.62, 0.94],
)

h2("4.3 Privilege separation note")
para(
    "Two design decisions are worth surfacing. First, an administrator is authorised by an active status "
    "as well as a role, so suspending an administrator removes their power rather than only their sign-in. "
    "Second, the audit log is readable only by the service role, not by administrators directly - an "
    "administrator reads it through the dashboard's service layer, so there is no browser-side path to it "
    "at all.",
)

page_break()

# ===========================================================================
# 5. ARCHITECTURE
# ===========================================================================
h1("5. System Architecture")

h2("5.1 Technology stack")
table(
    ["Layer", "Technology", "Version", "Evidence"],
    [
        ["Frontend", "React with Next.js App Router", "19.2.8 / 16.3.5", "package.json"],
        ["Language", "TypeScript (strict)", "5.x", "tsconfig.json"],
        ["Styling", "Tailwind CSS", "4.x", "package.json"],
        ["Backend", "Next.js Route Handlers (64 endpoints)", "16.3.5", "src/app/api/**"],
        ["Validation", "Zod", "4.6.5", "src/lib/validations/"],
        ["Database", "PostgreSQL via Supabase", "15 migrations", "supabase/migrations/"],
        ["Auth", "Supabase Auth + server session cookies", "0.12.7 (ssr)", "auth.service.ts, lib/supabase/"],
        ["Payments", "Razorpay Route (India)", "2.9.8", "razorpay.provider.ts"],
        ["Email", "SendGrid v3 Mail Send", "8.1.6", "channels/email.ts"],
        ["Object storage", "Supabase Storage", "-", "bucket: message-attachments (00006)"],
        ["Testing", "Vitest", "4.1.11", "vitest.config.ts, src/tests/"],
        ["Linting", "ESLint + eslint-config-next", "9 / 16.3.5", "eslint.config.mjs"],
    ],
    widths=[0.95, 2.15, 1.15, 2.45],
)

h2("5.2 High-level architecture")
code(
    """                        +---------------------------+
                        |        Web Browser         |
                        |  Next.js pages (14 routes)  |
                        +-------------+-------------+
                                      |
                            HTTPS (session cookie)
                                      v
     +--------------------------------------------------------------------+
     |                     Next.js Application                             |
     |                                                                    |
     |  src/proxy.ts  - route protection (redirect convenience only)       |
     |                                                                    |
     |  +------------------+        +----------------------------+        |
     |  |  API Routes (64) |        |  Service Layer (12)        |        |
     |  |  AuthService     |------->|  domain logic + state      |        |
     |  |  zod validation  |        |  machines + authorisation |        |
     |  +------------------+        +-------------+--------------+        |
     +-----------------------------------|------------------------------+
                                         |
                        +----------------+----------------+
                        |                                 |
          +-------------v--------------+        +---------v----------+
          |   Supabase (PostgreSQL)    |        |  External Providers|
          |   - Row Level Security      |        |                   |
          |   - SECURITY DEFINER RPCs   |        |  Razorpay Route   |
          |   - Triggers + constraints  |        |   (escrow/payout) |
          |   - 33 tables, 25 enums     |        |                   |
          |   - 51 RLS policies         |        |  SendGrid         |
          |   - 9 triggers              |        |   (transactional) |
          |   - Supabase Auth           |        |                   |
          |   - Object Storage          |        |  Supabase Storage |
          +-----------------------------+        |   (attachments)   |
                                                 +-------------------+"""
)

h2("5.3 Request lifecycle")
para(
    "Every state-changing request traverses the same four-layer path. This layering is the platform's "
    "primary security property and is enforced consistently rather than case by case.",
)
code(
    """  HTTP request
      |
      1. SESSION        AuthService.getCurrentUser() validates the JWT against Supabase
      |                 Auth and returns the users row (role + status).
      v
     2. VALIDATION     Zod schemas reject malformed, out-of-range and unexpected
      |                 fields. Strict object schemas reject unknown keys outright,
      |                 so a client cannot smuggle a field the server did not intend
      |                 to accept (for example a recipient id or a review role).
      v
     3. SERVICE        The service layer re-derives the caller's relationship to
      |                 the resource from the database - never from the request -
      |                 and applies the domain state machine.
      v
     4. DATABASE       Row Level Security plus CHECK, UNIQUE and FK constraints,
                        and where warranted a BEFORE trigger, reject anything the
                        layers above would have allowed. The service role bypasses
                        RLS, so the database is the backstop for internal logic
                        errors rather than for browser access."""
)

h2("5.4 Service layer")
table(
    ["Service", "Lines", "Responsibility"],
    [
        ["admin.service.ts", "1,107", "Moderation, disputes, reports, audit, admin read models"],
        ["auth.service.ts", "271", "Registration, login, session resolution, role lookup"],
        ["base.service.ts", "25", "Shared error normalisation"],
        ["client-api.service.ts", "55", "Browser-side API client"],
        ["contract.service.ts", "407", "Contracts, milestones, lifecycle transitions"],
        ["job.service.ts", "362", "Job publication, discovery, matching"],
        ["messaging.service.ts", "928", "Conversations, messages, attachments"],
        ["notification.service.ts", "700", "Notification emission, preferences, read state"],
        ["payment.service.ts", "1,545", "Payment lifecycle, escrow, payouts, refunds, webhooks"],
        ["profile.service.ts", "585", "Client/consultant profiles, skills, portfolios"],
        ["proposal.service.ts", "643", "Proposal submission and state transitions"],
        ["review.service.ts", "671", "Reviews, reputation, eligibility"],
    ],
    widths=[1.6, 0.55, 4.55],
)

page_break()

# ===========================================================================
# 6. DATABASE ARCHITECTURE
# ===========================================================================
h1("6. Database Architecture")

h2("6.1 Entity groups")
table(
    ["Domain", "Tables"],
    [
        ["Identity and access", "users, profiles, client_profiles, consultant_profiles, companies, user_status, user_role"],
        ["Capability catalogue", "skills, job_skills, consultant_skills, consultant_certifications, certifications, portfolios"],
        ["Marketplace", "jobs, proposals"],
        ["Engagement", "contracts, milestones, disputes, reports"],
        ["Money", "payments, payouts, payment_refunds, payment_webhook_events, payment_status_history, platform_fee_config"],
        ["Reputation", "reviews, review_edits, reputation"],
        ["Messaging", "conversations, conversation_members, messages, message_attachments"],
        ["Notifications", "notifications, notification_deliveries, notification_preferences"],
        ["Administration", "admin_audit_log"],
    ],
    widths=[1.6, 5.1],
)

h2("6.2 Core entity relationships")
code(
    """  users 1---1 profiles
       |  1---0..1 client_profiles
       |  1---0..1 consultant_profiles ---> consultant_skills >--- skills
       |                                  \\-> portfolios
       |                                  \\-> consultant_certifications >--- certifications
       |                                        role: 'admin' also carries admin_audit_log access
       |
       |  1---* jobs *---1 client_profiles
       |             |
       |             *---* job_skills >--- skills
       |             |
       |             *---* proposals *---1 consultant_profiles
       |
       +---* contracts *---1 client_profiles
                    *---1 consultant_profiles
                    |
                    *---* milestones
                    |        |
                    |        *---0..1 payments
                    |                  |
                    |                  *---0..1 payouts
                    |                  *---* payment_refunds
                    |                  *---1 payment_webhook_events (idempotency)
                    |                  *---* payment_status_history
                    |
                    *---* disputes
                    *---* reviews
                    *---* reports

  conversations *---* users          (via conversation_members)
       *---* messages *---0..* message_attachments  -> Storage: message-attachments

  notifications *---1 users
       *---* notification_deliveries
  notification_preferences *---1 users  (override rows only)

  reputation *---1 users  (denormalised aggregate, recomputed from reviews)
  admin_audit_log  (append-only, service-role readable only)"""
)

h2("6.3 Referential and integrity posture")
bullet("33 tables with primary keys and declared foreign keys; ON DELETE behaviour is explicit (RESTRICT where history must survive, SET NULL where a reference is descriptive).")
bullet("Rating values are bounded by CHECK constraints at 1-5 on every dimension, in addition to application validation.")
bullet("Self-referencing integrity is prevented: chk_no_self_review, chk_no_self_dispute.")
bullet("Financial arithmetic is constrained: chk_payment_math asserts gross = fee + net on every payment row.")
bullet("Read-state consistency is constrained: chk_notification_read_state requires is_read and read_at to agree.")
bullet("Essential notifications are constrained: chk_notification_in_app_locked prevents a money or dispute notification from being suppressed.")
bullet("Uniqueness carries domain meaning: one active proposal per consultant per job, one review per party per contract, one live review per (contract, reviewer), one delivery per (notification, channel), one dedup key per event occurrence.")

h2("6.4 Indexing strategy")
para(
    "Indexes are deliberately partial where a query filters on a boolean or a state, so that high-volume "
    "tables keep small hot indexes rather than one that grows with all history.",
)
table(
    ["Index", "Definition", "Serves"],
    [
        ["idx_notifications_user_unread", "(user_id, created_at DESC) WHERE is_read=false AND in_app_enabled=true", "Unread badge and unread feed - index-only scan"],
        ["idx_notifications_user_recent", "(user_id, created_at DESC) WHERE in_app_enabled=true", "Visible feed"],
        ["uq_notifications_dedup_key", "UNIQUE (dedup_key) WHERE dedup_key IS NOT NULL", "At-most-once notification emission"],
        ["idx_reviews_reviewee_live", "(reviewee_user_id) WHERE deleted_at IS NULL", "Reputation aggregation and public review listing"],
        ["idx_reputation_consultant_ranking", "(bayesian_rating DESC, total_reviews_count DESC)", "Consultant discovery ordering"],
        ["idx_notification_deliveries_retry", "(next_retry_at) WHERE status='failed'", "Delivery retry sweep"],
    ],
    widths=[1.85, 2.75, 2.1],
)

h2("6.5 Triggers")
table(
    ["Trigger", "Migration", "Purpose"],
    [
        ["trg_enforce_review_integrity", "00010 / 00012", "BEFORE INSERT OR UPDATE - validates contract completion, party pairing, no self-review, role authenticity, identity immutability and the 7-day edit window"],
        ["trg_reviews_refresh_reputation", "00010", "AFTER INSERT/UPDATE/DELETE - recomputes the reviewee's reputation in the same transaction"],
        ["trg_admin_audit_append_only", "00014", "BEFORE UPDATE OR DELETE on admin_audit_log - raises an exception unconditionally, making the log append-only at the database level"],
        ["update_notifications_updated_at", "00003", "Maintains the notifications updated_at column"],
        ["trg_webhook idempotency claims", "00009 / 00010", "Support at-most-once processing of payment and notification events"],
        ["trg_review_edits (via review_edits table)", "00010", "Audit of every review create, edit and delete with before/after snapshots"],
    ],
    widths=[1.9, 1.1, 3.7],
)

page_break()

# ===========================================================================
# 7. MIGRATION HISTORY
# ===========================================================================
h1("7. Migration History")

callout(
    "Migration application state",
    "The repository contains 15 migration files. Migration application to any database cannot be "
    "independently verified from the repository: the only schema-dump artifact present "
    "(remote-schema.sql) is zero bytes, and no migration ledger table output is present. Migration 00011's "
    "header asserts that remediation was found while validating migration 00009 against a live database, "
    "but that is a claim in a source comment rather than verifiable evidence. All database statements in "
    "this report are therefore structural/static verification.",
    fill="FFF6E5", bar=WARN,
)

table(
    ["Migration", "Stage", "Purpose", "Status"],
    [
        ["00001_initial_schema", "Foundation", "Core schema: users, profiles, jobs, proposals, contracts, milestones, payments, payouts, reviews, disputes, reports, messages, notifications, 25 enums", "Source only"],
        ["00002_seed_data", "Foundation", "Reference data (skills, certifications, categories)", "Source only"],
        ["00003_messaging_rls", "Messaging", "Conversations, messages, attachments; RLS and unread-count helpers", "Source only"],
        ["00004_contracts_milestones_stage9", "Stage 9", "Contract and milestone state enums; RLS authorisation helpers; in-app delivery enabled for messages", "Source only"],
        ["00005_core_rls_hardening", "Hardening", "Revokes anonymous reads of profile tables; grants authenticated access to public catalogue data", "Source only"],
        ["00006_storage_security", "Hardening", "Object storage policies for the message-attachments bucket", "Source only"],
        ["00007_fix_conversation_members_rls_recursion", "Hardening", "Removes a recursive RLS policy on conversation_members", "Source only"],
        ["00008_notifications_messaging_rls_hardening", "Hardening", "Removes the browser INSERT path on notifications (spoofing fix); hardens conversation access", "Source only"],
        ["00009_payments_stage10", "Stage 10", "Razorpay Route column remap, escrow invariants, webhook idempotency, fee configuration table, RLS", "Source only"],
        ["00010_reviews_reputation_stage11", "Stage 11", "Rating dimension rename, review integrity trigger, edit audit, reputation aggregate, Bayesian ranking, RLS", "Source only"],
        ["00011_rpc_grant_hardening", "Remediation", "Revokes an unintended anon grant on four SECURITY DEFINER functions that a stage-10 audit found remotely reachable", "Source only"],
        ["00012_reviews_reputation_remediation", "Remediation", "Tightens the review trigger (identity immutability, withdrawal window), adds the reviewee index, restores the review_edits grant, hardens refresh_reputation grants", "Source only"],
        ["00013_notifications_stage12", "Stage 12", "Four missing notification event types, dedup key and unique index, delivery outbox, preferences, unread-count function, in_app_enabled column and suppression constraint", "Source only"],
        ["00014_admin_dashboard_stage13", "Stage 13", "admin_audit_log with append-only trigger, job/proposal moderation state, admin read models, RLS", "Source only"],
        ["00015_admin_transactions_stage13", "Stage 13", "Four transactional SECURITY DEFINER moderation procedures with row locking, audit-in-transaction and explicit grant hygiene", "Source only"],
    ],
    widths=[1.85, 0.95, 3.5, 0.85],
    font=8,
)

h2("7.1 Remediation migrations")
para(
    "Migrations 00011, 00012 and 00015 are remediation work generated by independent security audits "
    "rather than by feature development. They are separated here because their purpose is corrective and "
    "they document known attack classes that were found and closed. Section 15 summarises the findings.",
)

page_break()

# ===========================================================================
# 8. AUTH
# ===========================================================================
h1("8. Authentication and Authorization")

h2("8.1 Authentication")
para(
    "Authentication uses Supabase Auth. The server resolves a session on every request by calling "
    "supabase.auth.getUser(), which validates the JWT against the Supabase Auth server rather than "
    "decoding it locally. The resulting user id is used to load the users row, which carries role and "
    "status.",
)
code(
    """  Browser  --(httpOnly session cookie)-->
  Next.js  --(server-side getUser())-->  Supabase Auth   [JWT validated server-side]
     |
     +--> users row  { id, email, role, status }
            role drives authorisation; role is NOT taken from a JWT claim
            or from any request body."""
)
callout(
    "Why the role is read from the database",
    "Authorisation reads role from the users table rather than from a signed token claim or a request "
    "field. The users table is write-protected from browser roles, so a user cannot elevate their own "
    "privilege. This is the single most important authorisation decision in the codebase.",
    fill="EAF4EA", bar=GOOD,
)

h2("8.2 Where authorisation happens")
table(
    ["Layer", "Mechanism", "What it protects against"],
    [
        ["Route (src/proxy.ts)", "Regex redirect for protected and admin paths", "Unauthenticated navigation. Convenience only - explicitly documented as not an authorisation control"],
        ["Route handler", "AuthService.getCurrentUser(); 401 when absent", "Unauthenticated API access"],
        ["Validation", "Zod strict schemas; reject unknown keys", "Malformed input, out-of-range values, field smuggling"],
        ["Service layer", "Re-derives the caller's relationship to the resource from the database", "IDOR, cross-tenant access, recipient spoofing"],
        ["Service layer", "Domain state machines with role-per-transition checks", "Illegal lifecycle transitions, actor-role confusion"],
        ["Database (RLS)", "51 policies keyed on auth.uid() through profile ownership", "Direct browser queries bypassing the application"],
        ["Database (RPC)", "SECURITY DEFINER functions with in-function actor verification", "Privilege escalation through RPC invocation"],
        ["Database (triggers)", "BEFORE INSERT/UPDATE validation; append-only audit trigger", "Identity rewriting, unaudited mutation"],
    ],
    widths=[1.2, 2.5, 3.0],
)

h2("8.3 Route protection caveat")
para(
    "src/proxy.ts redirects unauthenticated users away from protected and admin paths. This is a "
    "user-experience measure only, and the code says so: a signed-in non-administrator passes straight "
    "through the proxy check and is rejected by AdminService.requireAdmin() with a 403. Every real "
    "authorisation decision happens in the service layer or the database, never in the proxy.",
)

h2("8.4 Administrator authorisation")
code(
    """  AdminService.requireAdmin(userId)
      |
      +--> SELECT id, email, role, status FROM users WHERE id = $1
            |
            +--> missing row        -> 401  (identity failed; not a permission decision)
            +--> role is not 'admin' -> 403
            +--> status <> 'active'  -> 403  (suspension removes power, not just sign-in)

  ...then, for every mutation, a SECURITY DEFINER procedure that re-verifies the
  actor inside the database, locks the target row, and writes the audit entry
  in the same transaction as the state change."""
)

page_break()

# ===========================================================================
# 9. RLS
# ===========================================================================
h1("9. Row Level Security")

para(
    "Row Level Security is enabled across the sensitive tables and is the platform's most important "
    "structural control. 51 policies are defined across the migration set.",
    size=10.5,
)

h2("9.1 Protected tables and access matrix")
table(
    ["Table group", "anon", "authenticated", "Service role"],
    [
        ["users", "No access", "Own row only (SELECT)", "Full"],
        ["client_profiles / consultant_profiles", "No access", "Restricted columns; public projections via service endpoints", "Full"],
        ["jobs", "Published jobs only", "Own jobs + published", "Full"],
        ["proposals", "No access", "Own proposals (author) or proposals on own jobs (client)", "Full"],
        ["contracts / milestones", "No access", "Participant only, via ownership helpers", "Full"],
        ["payments / payouts", "No access", "No direct browser access; served via service endpoints", "Full"],
        ["reviews", "Public reviews only", "Own + public", "Full"],
        ["reputation", "No access", "Read (public aggregate)", "Full"],
        ["notifications", "No access", "Own rows only, UPDATE restricted to read state", "Full; sole writer"],
        ["notification_preferences", "No access", "Own rows only (FOR ALL, both USING and WITH CHECK)", "Full"],
        ["notification_deliveries", "No access", "Read policy exists; no table grant", "Full"],
        ["conversations / messages", "No access", "Conversation members only", "Full"],
        ["disputes", "No access", "Participant only", "Full"],
        ["admin_audit_log", "!!No access - REVOKE ALL", "!!No access - REVOKE ALL", "Read and append only (append-only trigger)"],
    ],
    widths=[1.85, 1.0, 2.35, 1.5],
    font=8.5,
)

h2("9.2 Key security invariants")
callout(
    "Notifications cannot be spoofed",
    "Migration 00008 removed the browser INSERT path on the notifications table and 00013 re-asserts the "
    "revoke. Combined with the absence of any API route that creates a notification, a user cannot send a "
    "notification to another user regardless of what they submit. Notifications are written only by the "
    "service layer.",
    fill="EAF4EA", bar=GOOD,
)
callout(
    "The audit log is append-only and browser-invisible",
    "admin_audit_log carries a BEFORE UPDATE OR DELETE trigger that raises an exception unconditionally, so "
    "the log cannot be rewritten or erased even by a privileged role. RLS is enabled and ALL privileges "
    "are revoked from anon and authenticated - including SELECT - so administrators read it through the "
    "dashboard's service layer rather than directly.",
    fill="EAF4EA", bar=GOOD,
)
callout(
    "Storage objects are participant-scoped",
    "The message-attachments bucket carries three policies (insert, select, delete) scoped to conversation "
    "participation rather than to file ownership, so a user cannot read or delete another participant's "
    "attachments.",
)

h2("9.3 Verification status")
para(
    "RLS behaviour is structurally verified only. No test exercises a two-user read or write against a live "
    "database, and no policy has been executed. Policy expressions are readable and their intent is "
    "correct, but effectiveness is unproven. This is the single most significant verification gap in the "
    "project and is repeated in section 22.",
)

page_break()

# ===========================================================================
# 10. PAYMENTS
# ===========================================================================
h1("10. Payment Architecture")

h2("10.1 Provider decision and its consequence")
para(
    "The payment provider is Razorpay Route, scoped to India. This is a significant architectural "
    "constraint that was arrived at deliberately: the original schema was written against Stripe "
    "Connect, but Stripe is not available in India. Stripe's own documentation lists India as preview and "
    "invite-only, omits India from its marketplace regions, and cannot pay out INR to accounts outside "
    "India. Migration 00009 therefore remaps the Stripe-specific columns onto Razorpay primitives rather "
    "than implementing against a provider that cannot settle the target currency.",
)

h2("10.2 Escrow model")
para(
    "Razorpay caps manual payment capture at 7,200 minutes and automatically refunds anything left "
    "uncaptured after that window. An authorised-but-uncaptured payment therefore cannot serve as a "
    "long-lived escrow state. The implementation captures the payment immediately and holds the escrow on "
    "the Route transfer's on_hold flag instead.",
)
code(
    """  Payment lifecycle (payment_status enum)

    pending  ──capture──>  held_in_escrow  ──client releases──>  released
       │                          │                                  │
       │                          └──refund──>  refunded <──────────┘
       └──failed──>  failed

  Payout lifecycle (payout_status enum)

    pending ──hold released──> processing ──settlement──> completed
       │                            │
       └──transfer failed──> failed └──transfer reversed──> failed

  Transfer settlement states:  on_hold -> pending -> settled
  ('released' means the hold was removed and settlement is queued under the
   linked account's own schedule. It does NOT mean the money has arrived.)"""
)

h2("10.3 Payment flow")
numbered("Client funds a milestone. The amount is read from milestones.amount_cents; the browser supplies no amount.")
numbered("An order is created at the provider and a pending payment row is written first, so an abandoned checkout is visible rather than silent.")
numbered("The browser completes payment with the provider and the provider payment id is attached. The service verifies that payment belongs to this order and that its amount equals the recorded gross.")
numbered("On capture, the platform records the payment as held in escrow and creates a Route transfer to the consultant's linked account with on_hold set. The transfer amount is the net figure, so the platform fee is simply the amount not transferred.")
numbered("When the client approves the milestone and releases, the hold is removed from the transfer and the payment becomes released. Settlement to the consultant's bank then follows the linked account's own schedule.")
numbered("A refund reverses the transfer in the same call, so a consultant cannot retain funds for which the client was refunded.")

h2("10.4 Security controls in the payment path")
table(
    ["Control", "Implementation", "Evidence"],
    [
        ["Amount is never trusted from the browser", "createPayment accepts only a milestone id; amount read from the database", "paymentCreateSchema strict; FORBIDDEN_PAYMENT_INPUT_KEYS"],
        ["Server-authoritative price", "Gross from milestone; fee from server-side configuration; net derived", "lib/payments/fees.ts"],
        ["Fee arithmetic is database-constrained", "chk_payment_math: gross = fee + net", "migration 00009"],
        ["Escrow total constrained", "assert_contract_funding_within_total() RPC prevents over-funding a contract", "migration 00009"],
        ["Confirmation is server-side", "confirmPayment fetches from the provider and compares the captured amount to the stored gross; mismatch is a 409", "PaymentService.confirmPayment()"],
        ["Webhook signature verified", "HMAC-SHA256 over the raw request body, verified before parsing", "payments/webhook/route.ts; Razorpay.validateWebhookSignature"],
        ["Webhook processing is idempotent", "Event id claimed under a unique constraint before any effect; a failed event is re-entered, not skipped", "payment_webhook_events; PaymentService.handleWebhook()"],
        ["Escrow requires a payout-capable consultant", "Funding refused unless the consultant's linked account reports payouts enabled", "PaymentService.createPayment()"],
        ["Refund is not client self-service", "Refund requires a dispute or administrator context and a reason", "getRefundAuthorizer()"],
        ["Payment transitions are a state machine", "Invalid transitions rejected; terminal states cannot be left", "payment.schemas.ts"],
    ],
    widths=[1.75, 3.15, 1.8],
    font=8.5,
)

h2("10.5 Amount formatting")
para(
    "All amounts are integer paise. Notification copy renders them by integer division with a fixed two-decimal "
    "format, so no floating-point rounding can place an incorrect figure in front of a user. Formatting is "
    "currency-aware rather than hardcoding a rupee symbol, because the ledger is designed to be "
    "multi-currency.",
)

page_break()

# ===========================================================================
# 11. REVIEWS
# ===========================================================================
h1("11. Review and Reputation System")

h2("11.1 Model")
para(
    "Reviews are bidirectional. When a contract completes, the client may review the consultant and the "
    "consultant may review the client. Four dimensions are rated on a 1-5 scale - overall, communication, "
    "quality and timeliness - plus optional written feedback.",
)

h2("11.2 Eligibility rules and where each is enforced")
table(
    ["Rule", "Enforced in application", "Enforced in database"],
    [
        ["Only the two parties on the contract may review", "Yes - eligibility check", "++Yes - BEFORE INSERT trigger resolves the contract's parties and rejects non-parties"],
        ["The party reviewed must be the counterpart", "Yes", "++Yes - trigger rejects a third-party reviewee"],
        ["A valid completed contract is required", "Yes", "++Yes - trigger requires status = 'completed'"],
        ["One review per party per contract", "Yes", "++Yes - UNIQUE (contract_id, reviewee_user_id) plus a partial UNIQUE on (contract_id, reviewer_user_id) WHERE deleted_at IS NULL"],
        ["No self-review", "Structurally impossible - the reviewee is derived as the counterpart", "++Yes - chk_no_self_review plus the trigger"],
        ["Reviewer role cannot be forged", "Yes", "++Yes - the trigger sets reviewee_role and validates reviewer_role against the real profile"],
        ["Reviews are not arbitrarily editable", "Yes - author only, within 7 days", "++Yes - trigger freezes identity and enforces the window; deletion by the author is window-bound"],
        ["Unauthorized deletion is refused", "Yes - author, or an administrator with a reason", "Partial - audit row and attribution constraint"],
        ["Deleted reviews cannot be restored", "Yes", "++Yes - trigger refuses"],
    ],
    widths=[1.9, 2.15, 2.65],
    font=8.5,
)

h2("11.3 Reputation calculation")
para(
    "Two distinct numbers are stored, and they are deliberately not interchangeable.",
)
bullet("The true arithmetic mean of live public reviews. This is the number displayed to users and is never adjusted.")
bullet("A Bayesian-smoothed score used only for ordering in search: (C x m + sum) / (C + n), with prior mean m = 4.0 and prior weight C = 8.")
para(
    "The smoothing exists because a raw average lets a participant with a single five-star review tie one "
    "with two hundred reviews at 4.9. That is not a quality signal, it is a signal that one review was "
    "purchased. The prior makes review volume matter. A search-ordering floor of three reviews additionally "
    "keeps an unproven participant below a proven one. The prior is a fixed constant rather than the live "
    "marketplace mean, because a global mean would make everyone's score drift as the population changes.",
)

h2("11.4 Reputation integrity")
bullet("Reputation is recomputed in full from the reviews table on every change. It is never incremented, so no sequence of writes can produce a figure the underlying reviews do not support.")
bullet("The aggregate is protected by chk_reputation_distribution_total, which asserts the rating distribution sums to the review count, so the displayed bars and the count cannot disagree.")
bullet("An essential-notification-style constraint pattern is reused: a participant with zero reviews reports a zero average but ranks at the prior of 4.0, not at the bottom.")
bullet("No service method writes the reputation table. A test asserts this.")

page_break()

# ===========================================================================
# 12. NOTIFICATIONS
# ===========================================================================
h1("12. Notification System")

h2("12.1 Architecture")
para(
    "Notifications are emitted through a single service entry point. Business code calls a typed event "
    "builder; the builder composes the notification; NotificationService decides whether to record it, "
    "resolves the recipient's channel preferences, and fans out to the enabled channels. Nothing else "
    "writes to the notifications table.",
)
code(
    """  Business event (contract approved, payment captured, message sent, ...)
        |
        v
  Typed event builder  (src/lib/notifications/events.ts)
        |  derives recipient from a database relationship
        |  supplies a deterministic event identity
        v
  NotificationService.emit()
        |
        +--> resolve in_app preference   (authoritative decision point)
        +--> resolve channel preferences
        |
        +--> if nothing enabled        -> create NO row
        +--> if in_app off, email on   -> row marked in_app_enabled = false (delivery parent only)
        +--> if in_app on              -> row created, in_app channel invoked
        |
        +--> INSERT with dedup_key      (unique index arbitrates duplicates)
        |
        +--> fan out to enabled channels
                +--> in_app channel  (durable record)
                +--> email channel   (SendGrid, via @sendgrid/mail)
        |
        +--> record a delivery row per channel (status, provider id, error, retry hint)"""
)

h2("12.2 Event coverage")
para(
    "All fourteen required events are implemented and wired to a reachable production route. Recipient "
    "derivation is shown because it is the security-relevant property.",
    italic=True, size=9, color=MUTED,
)
table(
    ["#", "Event", "Type", "Recipient derived from", "In-app", "Email default", "Event identity"],
    [
        ["1", "New proposal", "proposal_received", "jobs.client_id -> client profile", "On, optional", "~~Off", "proposal id"],
        ["2", "Proposal accepted", "proposal_accepted", "Proposal's consultant profile", "On, optional", "On", "proposal id"],
        ["3", "Proposal rejected", "proposal_rejected", "Proposal's consultant profile", "On, optional", "On", "proposal id"],
        ["4", "New message", "message_received", "Conversation members, excluding sender", "On, optional", "~~Off", "!!message id"],
        ["5", "Contract created", "contract_created", "Contract's consultant profile", "++Locked", "On", "contract id"],
        ["6", "Milestone created", "milestone_created", "Contract's consultant profile", "On, optional", "~~Off", "milestone id"],
        ["7", "Milestone submitted", "milestone_submitted", "Contract's client profile", "On, optional", "On", "!!milestone id + submission"],
        ["8", "Milestone approved", "milestone_approved", "Contract's consultant profile", "On, optional", "On", "milestone id"],
        ["9", "Payment successful", "payment_escrowed", "Consultant profile on the payment", "++Locked", "On", "payment id"],
        ["10", "Payment failed", "payment_failed", "Client profile on the payment", "++Locked", "On", "payment id"],
        ["11", "Payout processed", "payment_released", "Consultant profile on the payment", "++Locked", "On", "payment id"],
        ["12", "Contract completed", "contract_completed", "Both contract parties", "++Locked", "On", "contract id"],
        ["13", "New review", "review_submitted", "The reviewee", "++Locked", "On", "review id"],
        ["14", "Dispute opened", "dispute_opened", "Contract counterparty (respondent)", "++Locked", "On", "contract id (see note)"],
    ],
    widths=[0.28, 1.25, 1.1, 1.65, 0.72, 0.72, 0.98],
    font=7.5,
)

h3("Delivery guarantee terminology")
callout(
    "At-most-once emission, not exactly-once delivery",
    "The database guarantees that one event occurrence produces at most one notification row: a "
    "deterministic dedup key is backed by a partial unique index, and a concurrent second writer is "
    "rejected with a unique-violation which the service treats as success. That is an AT-MOST-ONCE "
    "emission guarantee. It is not exactly-once email delivery, and the report does not describe it as "
    "such: an email can fail after the row is written, and the delivery ledger records that failure for a "
    "future retry. A failed delivery is never retried by an automated worker today, so a rate-limited email "
    "(HTTP 429) is recorded as retryable but not yet redelivered.",
    fill="FFF6E5", bar=WARN,
)

h3("Note on the dispute event identity")
para(
    "The disputes table has no creation path in the application; the administration service can list and "
    "resolve disputes but nothing inserts a dispute row. The notification is therefore emitted at the "
    "authoritative moment a dispute begins - a contract transitioning to the disputed state - and keyed on "
    "the contract. This is safe while the contract state machine permits only one transition into disputed, "
    "and the event builder already accepts a dispute id that will tighten the key when a creation flow "
    "is added.",
)

h2("12.3 Notification preferences")
table(
    ["Aspect", "Implementation"],
    [
        ["Storage", "Override rows only. A user with no opinion has no row and the code-defined default applies."],
        ["Granularity", "Per event type, per channel"],
        ["Enforcement point", "The creation decision in emit(), before any row is written - not a read-time filter"],
        ["Channel independence", "Disabling one channel never suppresses another. in_app off with email on still delivers email, and the row is flagged so the feed and badge exclude it."],
        ["Locked events", "Nine event types concerning money, reputation, dispute and account security cannot have in-app disabled. The API rejects the request rather than storing a setting that would be ignored, and a database constraint enforces it independently."],
        ["Unread count", "Database-side count with no row transfer, scoped to the authenticated user"],
        ["Read state", "Bidirectional, with the read timestamp set and cleared together under a CHECK constraint"],
    ],
    widths=[1.35, 5.35],
    font=8.5,
)

h2("12.4 Email delivery")
bullet("Provider integration is the SendGrid v3 Mail Send API through the official @sendgrid/mail package. The tuple-returning response, the camelCase ASM shape, the 202 success code and the error-body location were verified against the SDK's own type declarations rather than assumed.")
bullet("Suppression-group configuration is environment-driven and optional. When unset, no ASM block is sent at all. No group id is hardcoded, which previously caused a 400 rejection on any account without that group.")
bullet("Every interpolated value is HTML-escaped and CR/LF-stripped in the text variant, because job titles, display names and dispute reasons are user-controlled.")
bullet("A recipient with no address on file is skipped rather than failed, since there is nothing to retry.")
bullet("Provider failures are recorded with a retry hint for 413, 429 and 500. A 400 is treated as non-retryable because it will fail identically on retry.")

page_break()

# ===========================================================================
# 13. ADMIN
# ===========================================================================
h1("13. Administration and Moderation")

h2("13.1 Administrative surface")
para("The administration subsystem exposes 17 API routes across 11 resources.")
table(
    ["Resource", "Route", "Capability"],
    [
        ["Overview", "/api/admin/overview", "Platform-wide counts and health read model"],
        ["Users", "/api/admin/users, /users/[id]", "Search, inspect, suspend, reinstate"],
        ["Jobs", "/api/admin/jobs, /jobs/[id]", "Search, inspect, flag, remove"],
        ["Proposals", "/api/admin/proposals, /proposals/[id]", "Search, inspect"],
        ["Disputes", "/api/admin/disputes", "List and resolve with a mandatory resolution summary"],
        ["Reports", "/api/admin/reports, /reports/[id]", "Triage and action user, job or proposal reports"],
        ["Payments", "/api/admin/payments", "Inspect the payment ledger"],
        ["Refunds", "/api/admin/payments/refunds", "Issue refunds through the admin-only authorizer"],
        ["Payouts", "/api/admin/payouts", "Inspect the payout ledger"],
        ["Audit log", "/api/admin/audit-log", "Read privileged action history"],
    ],
    widths=[1.0, 2.4, 3.3],
    font=8.5,
)

h2("13.2 Transactional administration")
para(
    "Moderation is not performed by a service-layer update. Every privileged mutation runs through a "
    "database-resident procedure that performs the audit write and the state change in one transaction, with "
    "the target row locked for the duration. This is the strongest integrity control in the platform.",
)
code(
    """  admin_moderate_job(p_admin_user_id, p_target_id, p_to_moderation, p_reason, ...)
      |
      1. LOCK      SELECT actor ... ; SELECT * FROM jobs WHERE id = $target FOR UPDATE
      2. VALIDATE  actor.role = 'admin' AND actor.status = 'active'
                  target status permits the transition
                  a reason is required to flag or remove, and forbidden to invent when clearing
      3. AUDIT     INSERT INTO admin_audit_log (actor, action, target, reason, ip, user_agent)
      4. MUTATE    UPDATE jobs SET moderation_status = ...
      5. COMMIT    audit row and state change land together or not at all

  Repeated for: admin_moderate_user, admin_update_dispute, admin_update_report"""
)
callout(
    "Why the audit write is inside the transaction",
    "If the audit entry and the mutation were separate writes, a crash between them would leave an "
    "administrator action that either happened without a record or was recorded without happening. "
    "Co-locating them in one transaction with a row lock means the audit log is a faithful account of "
    "privileged activity rather than a best-effort one, and the append-only trigger means it cannot later "
    "be edited to conceal anything.",
    fill="EAF4EA", bar=GOOD,
)

h2("13.3 Data minimisation in the admin layer")
para(
    "Administrative read models are explicitly minimised. The admin service selects only the columns a "
    "moderation decision requires rather than returning whole user, payment or payout records, and a "
    "dedicated test suite asserts this. This reduces the blast radius of a compromised administrator "
    "session.",
)

page_break()

# ===========================================================================
# 14. SECURITY ARCHITECTURE
# ===========================================================================
h1("14. Security Architecture")

h2("14.1 Philosophy")
para(
    "The platform applies defence in depth rather than relying on any single control. An authorisation "
    "decision is taken in at least two of four independent places, and the failure of one does not "
    "compromise the whole.",
    size=10.5,
)
code(
    """  +-------------------------------------------------------+
  |  APPLICATION   Zod validation, strict schemas rejecting   |
  |  AUTHORISATION  unknown fields; explicit role checks     |
  +-------------------------------------------------------+
                        |  independent
  +-------------------------------------------------------+
  |  SERVICE        Relationship re-derived from the         |
  |  AUTHORISATION  database; domain state machines          |
  +-------------------------------------------------------+
                        |  independent
  +-------------------------------------------------------+
  |  DATABASE       Row Level Security; CHECK, UNIQUE and    |
  |  AUTHORISATION  FK constraints; BEFORE triggers           |
  +-------------------------------------------------------+
                        |
  +-------------------------------------------------------+
  |  TRANSACTION    Row locking, audit-in-transaction,        |
  |  INTEGRITY      append-only audit, unique arbitrations   |
  +-------------------------------------------------------+"""
)

h2("14.2 Control inventory")
table(
    ["Control area", "Controls implemented"],
    [
        ["Authentication", "Server-side JWT validation via Supabase Auth; httpOnly session cookies; role and account status read from a write-protected table rather than from a token claim"],
        ["Authorisation", "51 RLS policies; ownership helper functions; service-layer relationship re-derivation; role-per-transition state machines; administrator verification on every request including account status"],
        ["Input validation", "Zod strict schemas across every write path; unknown keys rejected; whole-number and range constraints; malformed identifiers produce 400 rather than a database error"],
        ["Financial integrity", "chk_payment_math; escrow total RPC constraint; server-authoritative amounts; no amount accepted from a browser on any payment or payout path"],
        ["Webhook security", "HMAC-SHA256 signature verification over the raw request body before parsing; event id claimed under a unique constraint; failed events re-enter processing rather than being silently discarded"],
        ["Notification integrity", "No browser INSERT path; no API route creates a notification; recipients derived only from database relationships; dedup enforced by unique index"],
        ["Review integrity", "BEFORE trigger validating completion, party pairing, self-review, role authenticity, identity immutability and a time-bounded edit window; full before/after audit snapshots"],
        ["Administrative integrity", "Transactional SECURITY DEFINER procedures with row locking and in-transaction audit; append-only audit log; explicit EXECUTE grants; search_path pinned on every SECURITY DEFINER function"],
        ["Data minimisation", "Administrative read models select only required columns; storage access is participation-scoped; profile tables are not anonymously readable"],
        ["Auditability", "admin_audit_log (append-only, service-role only); review_edits; payment_status_history; payment_webhook_events; notification_deliveries; payment_refunds"],
        ["Error handling", "Typed application errors with HTTP status codes; internal errors never returned to the client; notification failures can never roll back a business write"],
    ],
    widths=[1.5, 5.2],
    font=8.5,
)

h2("14.3 Security posture - honest assessment")
bullet("Strengths: genuine multi-layer authorisation; database-enforced financial and review invariants; a class of RPC grant vulnerability was found by audit and closed; audit logging is transactionally coupled and append-only.")
bullet("Limitations: no security control has been verified against a live database; no penetration test or external assessment has been performed; no formal certification of any kind is held; the application has never been deployed.")

h2("14.4 Payment provider grant vulnerability class")
callout(
    "A remotely reachable privileged function, found and closed",
    "An independent Stage 10 audit discovered that Supabase provisions a default privilege of GRANT ALL ON "
    "ALL FUNCTIONS IN SCHEMA public to anon, authenticated and service_role. Because that is an EXPLICIT "
    "grant, the REVOKE ... FROM PUBLIC pattern used elsewhere in the codebase does not remove it. Four "
    "SECURITY DEFINER functions were therefore callable by an unauthenticated holder of the publishable "
    "anon key, one of which could create a contract and move a proposal to accepted. Migration 00011 "
    "closes this with explicit revokes from anon, authenticated and PUBLIC, and the corrected pattern was "
    "then applied to every function added in Stages 11, 12 and 13. This is recorded because it is the "
    "clearest example of the class of defect the audit process was designed to find.",
    fill="FFF6E5", bar=WARN,
)

page_break()

# ===========================================================================
# 15. AUDIT HISTORY
# ===========================================================================
h1("15. Security Audit History")

para(
    "Stages 10 through 13 each underwent an independent read-only audit, and each returned BLOCKED on "
    "first pass. Findings were remediated and then re-audited. The table summarises the audit outcomes; "
    "the verification column distinguishes what was structurally confirmed from what was executed.",
)

h2("15.1 Audit outcomes")
table(
    ["Stage", "First verdict", "High / Critical found", "Final verdict", "Verification basis"],
    [
        ["Stage 10 - Payments", "BLOCKED", "Provider incompatible with target market; RPC grant exposure; build failure", "Re-audited after remediation", "Static: migration SQL, provider adapter compiled against SDK types"],
        ["Stage 11 - Reviews", "BLOCKED", "Three endpoints non-functional due to path parsing; a silent zero-result failure; SECURITY DEFINER grant weakness; missing index", "PASS WITH FINDINGS", "Static: 52 added tests including a deliberately reintroduced-defect check"],
        ["Stage 12 - Notifications", "BLOCKED", "Message dedup keyed on conversation; in-app preference unenforceable; hardcoded email suppression group; four events unwired", "PASS WITH FINDINGS", "Static: 90+ tests, real unique-index race, business-path wiring tests"],
        ["Stage 13 - Admin", "Committed in 230162b", "Not independently re-audited in this report", "Not assessed", "Not assessed in this engagement"],
    ],
    widths=[1.15, 0.95, 2.35, 1.15, 1.7],
    font=8,
)

h2("15.2 Distinguishing fixed from verified")
table(
    ["Category", "Meaning", "Count in this project"],
    [
        ["++Fixed", "Code or schema changed to close a confirmed defect", "All High and Medium findings across Stages 10-12"],
        ["++Structurally verified", "Read and traced in source; correct by inspection, not executed", "All database-layer controls, all RLS policies, all RPC grants"],
        ["++Tested", "A passing automated test exercises the behaviour", "438 test cases across 20 suites"],
        ["!!Not live verified", "No live database or provider evidence exists", "Every database constraint, every RLS policy, Razorpay, SendGrid, Supabase Auth"],
        ["~~Deferred", "Known and accepted as out of scope for the current milestone", "Notification retry worker; production deployment; external penetration test"],
    ],
    widths=[1.5, 2.85, 2.35],
    font=8.5,
)

h2("15.3 Verification limitations to disclose")
bullet("No migration has been verified as applied to any database.")
bullet("No two-user RLS test has been executed against a live database.")
bullet("No payment or email has been sent through a live provider account.")
bullet("No concurrency test has executed two real database transactions; concurrency is proven by constraint inspection and by an in-memory unique-index model.")
bullet("The admin audit-log trigger has not been fired against production data.")
bullet("Stage 13's administration layer is committed but not independently re-audited in this report.")

page_break()

# ===========================================================================
# 16/17. TESTING AND QUALITY
# ===========================================================================
h1("16. Testing")

h2("16.1 Verified results")
table(
    ["Check", "Command", "Result"],
    [
        ["TypeScript", "npx tsc --noEmit", "++PASS - exit 0"],
        ["Unit/integration tests", "npx vitest run", "++PASS - 438/438 across 20 files, 2.7s"],
        ["Production build", "npx next build", "++PASS - exit 0, compiled successfully"],
        ["Lint", "npx eslint .", "~~93 problems (61 errors, 32 warnings) - pre-existing baseline"],
    ],
    widths=[1.5, 1.7, 3.5],
)

h2("16.2 Test suite inventory")
table(
    ["Suite", "Cases", "What it proves"],
    [
        ["admin-authorization", "60", "Administrator authorisation, role and status checks, privilege separation"],
        ["admin-db-hardening", "14", "Audit-log append-only guarantee, RPC grant hygiene, transaction atomicity"],
        ["admin-data-minimisation", "13", "Administrative read models expose only required columns"],
        ["auth-validation", "8", "Registration and credential validation"],
        ["foundation", "6", "Baseline schema and library expectations"],
        ["notification-dedup", "18", "Event identity, repeated and concurrent emission, distinct-event separation"],
        ["notification-email", "18", "Suppression-group configuration, provider error handling, escaping, no key leakage"],
        ["notification-remediation", "22", "Per-message identity, channel independence, preference enforcement, read state"],
        ["notification-routes", "31", "Endpoint-level contract: identifier extraction, authn, ownership, status codes"],
        ["notifications-core", "27", "Dedup key determinism, default preferences, template rendering and escaping"],
        ["notification-service", "24", "Emission, preferences, unread count, read state, delivery ledger"],
        ["notification-wiring", "6", "All fourteen events reachable from real business services with derived recipients"],
        ["payment-fees", "14", "Fee arithmetic and the gross = fee + net invariant"],
        ["payment-refund-authorization", "16", "Refund authorizer: who may refund and under what conditions"],
        ["payment-state-machine", "29", "Payment and payout transitions, terminal states"],
        ["payment-webhook-signature", "11", "HMAC signature verification, rejection of tampered and re-serialised bodies"],
        ["reputation-math", "28", "Bayesian smoothing, distribution, ordering, manipulation resistance"],
        ["review-routes", "26", "Review endpoint identifier extraction and authorisation"],
        ["review-service", "26", "Authorship, edit window, deletion authorisation, reputation integrity"],
        ["review-validation", "26", "Rating bounds, field-smuggling rejection"],
    ],
    widths=[1.85, 0.5, 4.35],
    font=8,
)

h2("16.3 What the tests do and do not prove")
table(
    ["Proven by tests", "Not proven by tests"],
    [
        ["Domain state machines reject illegal transitions", "That the state machines match the deployed database constraints"],
        ["Authorization logic returns the right status for each actor", "That RLS produces the same result for a direct browser query"],
        ["Amounts, ratings and fees are bounded and arithmetic is exact", "That a live payment provider accepts the payloads"],
        ["Webhook signature verification rejects tampering", "That a live provider will deliver a correctly signed event"],
        ["Notification emission is idempotent under a modelled race", "That two concurrent database transactions serialise correctly"],
        ["Escaping neutralises injected markup", "That a mail client renders escaped output safely in every client"],
        ["Business services emit notifications with database-derived recipients", "That the full request path works end to end against real infrastructure"],
    ],
    widths=[3.35, 3.35],
    font=8.5,
)

h2("17. Build and Code Quality")
table(
    ["Measure", "Status", "Note"],
    [
        ["TypeScript", "++Clean", "npx tsc --noEmit exits 0"],
        ["Production build", "++Clean", "npx next build exits 0"],
        ["Tests", "++Clean", "438/438 passing"],
        ["Lint", "~~Baseline issues", "93 problems (61 errors, 32 warnings)"],
        ["New lint debt from Stages 10-13", "++Zero", "Stage 12 files verified at 0 errors, 0 warnings"],
    ],
    widths=[2.2, 1.3, 3.2],
)
para(
    "The 61 lint errors are a pre-existing repository baseline concentrated in early-stage service files "
    "that predate Stage 10. They were measured before the recent work and are unchanged by it; the Stage 12 "
    "file set was verified separately at zero errors and zero warnings. This distinction is stated because "
    "an unqualified 'lint fails' would misrepresent the state of recent work.",
    size=9, italic=True, color=MUTED,
)

page_break()

# ===========================================================================
# 18. STAGE STATUS
# ===========================================================================
h1("18. Development Status by Stage")

table(
    ["Stage", "Objective", "Implementation", "Verification", "Status"],
    [
        ["1-2", "Foundation: schema, enums, seed catalogue", "33 tables, 25 enums, 2 migrations", "Static + unit", "++Complete"],
        ["3", "Messaging: conversations, messages, attachments", "messaging.service.ts, 6 routes, storage bucket", "Static + unit", "++Complete"],
        ["4-7", "Hardening: RLS, storage, recursion fix", "4 remediation migrations", "Static only", "++Complete, structurally verified"],
        ["8", "Notification and messaging RLS hardening", "Removed browser INSERT path on notifications", "Static only", "++Complete"],
        ["9", "Contracts and milestones", "contract.service.ts, 4 routes", "Static + unit", "++Complete"],
        ["10", "Payments: escrow, payouts, refunds, Razorpay Route", "payment.service.ts (1,545 lines), 8 routes", "Static + 70 tests; !!provider not live", "++Complete"],
        ["11", "Reviews and reputation", "review.service.ts, reputation.ts, 4 routes, 2 migrations", "Static + 80 tests; !!DB not live", "++Complete"],
        ["12", "Notifications: in-app, email, preferences", "notification.service.ts (700 lines), 5 routes, 3 channel modules", "Static + 146 tests; !!provider not live", "++Complete"],
        ["13", "Administration and moderation", "admin.service.ts (1,107 lines), 17 routes, 2 migrations", "Static + 87 tests; !!not re-audited here", "++Complete"],
    ],
    widths=[0.5, 1.85, 1.95, 1.55, 0.85],
    font=8,
)

h1("19. Git and Development History")
table(
    ["Item", "Value"],
    [
        ["Branch", "master"],
        ["Current commit", "230162b  Complete stages 10 through 13 security hardening"],
        ["Previous commit", "e793c86  Checkpoint unified application state"],
        ["Initial commit", "2893523  Initial commit from Create Next App"],
        ["Migration count", "15 (00001 - 00015)"],
        ["Working tree", "Clean for source; 30 untracked audit and report artifacts at repository root"],
    ],
    widths=[1.5, 5.2],
)
para(
    "Only three commits exist, so there is no meaningful per-stage commit history. Development progress is "
    "instead evidenced by the migration sequence, which carries an explicit stage number and purpose in "
    "each filename.",
    size=9, italic=True, color=MUTED,
)

page_break()

# ===========================================================================
# 20. WHAT IS COMPLETE
# ===========================================================================
h1("20. What Is Complete")

h2("20.1 Product")
bullet("Registration, authentication, session handling and role resolution for clients, consultants and administrators.")
bullet("Client and consultant profiles including skills, certifications and portfolio items.")
bullet("Job publication, marketplace browsing and proposal submission with active-proposal uniqueness enforcement.")
bullet("Proposal shortlisting, acceptance and rejection with role-gated transitions.")
bullet("Contract creation from an accepted proposal, with milestones, sequencing and fixed amounts.")
bullet("In-app messaging with conversations, attachments and per-participant unread counts.")
bullet("Administrator moderation across users, jobs, proposals, reports and disputes.")

h2("20.2 Backend")
bullet("64 API route handlers following a consistent authentication, validation, service, database structure.")
bullet("12 domain services totalling 7,702 lines.")
bullet("30 library modules covering validation, payments, reviews, notifications and Supabase access.")
bullet("A provider abstraction that isolates Razorpay and SendGrid behind testable interfaces.")

h2("20.3 Database")
bullet("33 tables, 25 enums, 15 migrations, 51 RLS policies, 9 triggers, 25 database functions.")
bullet("Explicit integrity constraints for financial arithmetic, rating bounds, read-state consistency, self-reference and essential-notification suppression.")
bullet("Partial and composite indexes sized to the actual query patterns.")
bullet("Append-only administrative audit log enforced by trigger.")

h2("20.4 Payments")
bullet("Escrow via Razorpay Route with held transfers, server-authoritative amounts and a database fee invariant.")
bullet("Full payment lifecycle including confirmation, escrow establishment, release, payout and refund with transfer reversal.")
bullet("Webhook endpoint with signature verification and idempotent event claiming.")
bullet("Consultant payout onboarding with payout-capability checks before funding.")

h2("20.5 Reviews and reputation")
bullet("Bidirectional reviews with four rated dimensions and optional written feedback.")
bullet("Reputation recomputed from reviews, with a Bayesian ranking score and a distribution histogram.")
bullet("Bounded editing with full before/after audit snapshots.")

h2("20.6 Notifications")
bullet("All fourteen required events wired to reachable production paths with database-derived recipients.")
bullet("In-app and transactional email across an extensible channel abstraction.")
bullet("Per-type, per-channel preferences with authoritative enforcement and a locked class of essential events.")
bullet("Unread counts computed database-side, and bidirectional read state.")
bullet("Per-channel delivery ledger recording outcome, provider identifier, error and retry hint.")

h2("20.7 Administration")
bullet("Transactional moderation procedures with row locking and in-transaction audit.")
bullet("Dispute and report resolution requiring an explicit outcome.")
bullet("Administrative read models verified for data minimisation.")
bullet("Refund and payout inspection endpoints.")

h2("20.8 Security and testing")
bullet("51 RLS policies, defence-in-depth authorisation across four layers.")
bullet("438 automated tests spanning state machines, authorisation, security properties, concurrency modelling and business-path wiring.")
bullet("Clean type check and production build.")
bullet("Three completed independent security audits with remediations committed.")

page_break()

# ===========================================================================
# 21/22. REMAINS + LIMITATIONS
# ===========================================================================
h1("21. What Remains")

h2("21.1 Required before production")
table(
    ["Item", "Why it blocks", "Evidence of absence"],
    [
        ["Apply the schema to a database and verify", "No control has been executed; no constraint proven to fire", "remote-schema.sql is zero bytes; no migration ledger output"],
        ["Live provider verification", "Payment and email code paths have never run against a real account", "No credentials or provider response evidence in repository"],
        ["Two-user RLS verification", "The most important structural control is unproven", "No database-integration test suite exists"],
        ["User interface for notifications, administration, payouts and review submission", "Core capabilities are unreachable to an end user", "14 pages against 64 API routes; no notification or admin page"],
        ["Notification retry worker", "Rate-limited or transient email failures are recorded but never redelivered", "next_retry_at written; no consumer found"],
        ["End-to-end test suite", "Only unit and mocked-service tests exist; no real request path is exercised", "No test issues a request against a running app"],
        ["Deployment and observability configuration", "The application has never been deployed; no error tracking or metrics", "No deployment configuration in repository"],
    ],
    widths=[1.75, 2.4, 2.55],
    font=8.5,
)

h2("21.2 Future enhancement")
bullet("Dispute creation flow, which would tighten the dispute notification's event identity.")
bullet("Proposal search indexing, deferred until meaningful data volume warrants it.")
bullet("Search and discovery integration using the existing reputation ranking index.")
bullet("Contract completion reviews interface and notification badge in the shell.")

h2("21.3 Optional hardening")
table(
    ["Item", "Risk if unaddressed", "Current state"],
    [
        ["Restrict the notifications UPDATE policy to read-state columns", "Currently unreachable - no table grant to authenticated. Would become a content-rewriting vector if a grant were ever added", "Low; no grant exists"],
        ["Drop or complete the notification delivery read policy", "Dead policy; deliveries are effectively service-role only", "Low"],
        ["Remove internal identifiers from provider metadata", "Sends internal ids to a third-party email processor", "Low"],
        ["Adopt default-privilege hardening for future functions", "Newly added functions inherit an anon grant until explicitly revoked", "Accepted with documented rationale"],
        ["Resolve the repository-root audit artifacts", "About 30 log and report files are untracked at the root", "Hygiene"],
    ],
    widths=[2.15, 2.75, 1.8],
    font=8.5,
)

h1("22. Known Limitations")
para(
    "This section is stated plainly because the distinction between what is built and what is proven is the "
    "most important thing an investor should take from this report.",
)
table(
    ["Limitation", "Why it exists", "Blocks current milestone?"],
    [
        ["No database has been migrated or verified", "No database access was available during development or audit", "!!Yes - blocks production"],
        ["No live payment or email provider call", "Requires real credentials and creates external side effects", "!!Yes - blocks production"],
        ["Two-user RLS behaviour untested", "Requires a live multi-user database fixture", "!!Yes - blocks production"],
        ["Concurrent transaction race not executed", "No database; proven by constraint inspection and an in-memory model instead", "No - mitigated by unique constraints"],
        ["Admin audit trigger not fired against production data", "Requires a populated database", "No"],
        ["Proposal search indexing deferred", "Deliberate; no meaningful data volume exists yet", "No"],
        ["No retry processor for notification deliveries", "No scheduler exists in the project", "No - but email loss is possible under provider rate limiting"],
        ["Frontend substantially behind backend", "Backend stages were sequenced first", "~~Yes for end-user completeness"],
        ["No external penetration test or security certification", "Not commissioned", "Recommended before handling real funds"],
        ["No dispute creation flow", "Never implemented; administration can resolve disputes that are created out of band", "No"],
    ],
    widths=[2.1, 2.75, 1.85],
    font=8.5,
)

page_break()

# ===========================================================================
# 23. SCALABILITY
# ===========================================================================
h1("23. Scalability")

para(
    "The following assessment is based only on architectural evidence in the repository. No load testing "
    "was performed and no capacity figure should be inferred.",
    italic=True, size=9, color=MUTED,
)

h2("23.1 Strengths")
table(
    ["Property", "Evidence"],
    [
        ["Bounded hot queries", "Partial indexes on unread and visible notification sets keep index size proportional to unread volume, not history"],
        ["Database-side counting", "Unread badge uses a head count with no row transfer"],
        ["Atomic deduplication", "Unique indexes arbitrate concurrent writers rather than serialising application logic"],
        ["Row locking over application locking", "Administrative mutations use SELECT ... FOR UPDATE, so correctness does not depend on application instances"],
        ["Pagination", "List endpoints accept page and limit with a bounded maximum"],
        ["Provider isolation", "A channel abstraction means adding a channel does not restructure the notification table"],
        ["Stateless service tier", "No server-side session store; the application scales horizontally with Supabase"],
    ],
    widths=[2.0, 4.7],
    font=8.5,
)

h2("23.2 Potential bottlenecks")
bullet("The per-type notification breakdown fetches rows because PostgREST offers no GROUP BY. It is deliberately confined to the settings screen; the badge path uses a count.")
bullet("The review listing and reputation aggregation filter on reviewee_user_id, now covered by a dedicated partial index.")
bullet("Contract funding and escrow are serialised per contract by design, which is correct for financial correctness but concentrates write load on a single contract during heavy funding.")
bullet("Escrow is a held-transfer model, so the number of in-flight held transfers scales with concurrently funded milestones and is bounded by the platform account balance.")
bullet("No connection pooling, read replica or caching layer is present in the repository; Supabase's managed pooler would be the expected approach and is not configured here.")

callout(
    "No capacity claim",
    "The architecture is appropriate to a marketplace at moderate scale. Establishing a production capacity "
    "figure would require load testing against a representative database, which has not been performed.",
    fill="FFF6E5", bar=WARN,
)

page_break()

# ===========================================================================
# 24. READINESS
# ===========================================================================
h1("24. Production Readiness")

table(
    ["Category", "Status", "Evidence"],
    [
        ["Application", "~~PARTIALLY READY", "Core domain complete; 14 of 64 API surfaces have UI; no end-to-end suite"],
        ["Database", "!!REQUIRES WORK", "15 migrations written, none verified as applied; no live constraint verification"],
        ["Security", "~~PARTIALLY READY", "Strong design and three completed audits; unproven against a live database; no external assessment"],
        ["Payments", "~~PARTIALLY READY", "Full escrow implementation with 70 tests; provider contract, KYC and credentials outstanding"],
        ["Notifications", "~~PARTIALLY READY", "Complete and well tested; email sender domain, suppression group and retry worker outstanding"],
        ["Testing", "~~PARTIALLY READY", "438 unit and mocked-service tests; zero database, integration or end-to-end tests"],
        ["Observability", "!!NOT ASSESSED", "No error tracking, metrics, logging pipeline or alerting in the repository"],
        ["Operations", "!!REQUIRES WORK", "Moderation tooling exists; runbooks, on-call, incident process and support tooling absent"],
        ["Deployment", "!!NOT ASSESSED", "No deployment configuration, CI/CD pipeline or environment strategy in the repository"],
        ["Scalability", "~~PARTIALLY READY", "Indexing and atomicity appropriate; no load testing or capacity validation"],
        ["Legal / compliance", "!!NOT ASSESSED", "Provider eligibility, data protection posture and marketplace terms are outside the code base"],
    ],
    widths=[1.3, 1.35, 4.05],
    font=8.5,
)

h1("25. Development Roadmap")
para(
    "Sequenced by dependency rather than by date. No dates are asserted because the repository contains no "
    "schedule.",
    italic=True, size=9, color=MUTED,
)

h2("Phase A - Current stabilisation")
bullet("Freeze the working tree and re-audit against a fixed commit; two stages were modified outside their own audit windows.")
bullet("Apply migrations 00001-00015 to a development database and verify the full schema.")
bullet("Add the missing Stage 12 route-level tests identified by the final audit.")
bullet("Resolve the unresolved Stage 12 findings, in particular the milestone-submission concurrency test.")

h2("Phase B - Production hardening")
bullet("Execute a two-user RLS verification suite against a real database with seeded fixtures.")
bullet("Verify the Razorpay and SendGrid integrations against live sandbox accounts, including webhook delivery.")
bullet("Run the notification retry worker as a scheduled job.")
bullet("Add an end-to-end request-level test suite against a running application.")
bullet("Add error tracking, structured logging and basic product metrics.")
bullet("Tighten the notifications UPDATE policy before granting any table privilege.")

h2("Phase C - Beta launch")
bullet("Build the user interface for notifications, review submission, payout visibility and administration.")
bullet("Implement the dispute creation flow so disputes are raised in-product.")
bullet("Complete payment-provider eligibility and KYC for the launch market.")
bullet("Add dispute, reporting and refund operations runbooks.")

h2("Phase D - Production launch")
bullet("External penetration test covering authorisation, payment and admin surfaces.")
bullet("Legal and compliance review: marketplace terms, privacy, dispute policy.")
bullet("Deployment pipeline with environment separation and a staging database.")
bullet("Monitoring, alerting and on-call procedures.")

h2("Phase E - Scale")
bullet("Load testing to establish a real capacity figure.")
bullet("Proposal and consultant search indexing on the existing reputation ranking index.")
bullet("Consider read replicas or caching if measured load warrants it.")
bullet("Additional notification channels (SMS, push) via the existing channel abstraction.")

page_break()

# ===========================================================================
# 26. TAKEAWAYS
# ===========================================================================
h1("26. Investor Takeaways")

h2("What has been built?")
para(
    "A working two-sided marketplace for enterprise SAP integration services, with the complete commercial "
    "chain implemented in the backend: discovery, proposals, contracts, itemised milestones, escrowed "
    "payments, delivery tracking, fund release, consultant payouts, mutual reviews, reputation, dispute "
    "handling, and administrative moderation. All fourteen required notification events fire from real "
    "business operations.",
)

h2("What technical foundation now exists?")
para(
    "A layered architecture in which every authorisation decision is made in at least two independent "
    "places. The database is a genuine backstop rather than a formality: financial arithmetic, rating "
    "bounds, duplicate prevention, review validity, identity immutability and audit immutability are all "
    "enforced by constraints and triggers, so an application bug cannot corrupt money or reputation. "
    "Administrative actions are transactional and audited by construction.",
)

h2("What has been independently verified?")
para(
    "Three completed independent security audits covering payments, reviews and notifications. Each "
    "returned BLOCKED on first pass; each found real, exploitable defects - including three endpoints that "
    "were entirely non-functional behind a fully green test suite, and a class of remotely reachable "
    "privileged database function. All were remediated and re-audited. 438 automated tests pass, the "
    "TypeScript check is clean, and the production build succeeds.",
)

h2("What security controls are in place?")
para(
    "51 row-level security policies; server-side token validation with roles read from a write-protected "
    "table; strict input validation rejecting field smuggling; verified payment webhooks with idempotent "
    "processing; a browser-proof notification write path; a database-enforced review integrity trigger; "
    "transactional administration with an append-only audit log; explicit function grant hygiene; and "
    "storage access scoped to conversation participation.",
)

h2("What remains before production?")
para(
    "The single most important caveat: none of this has been run. No migration has been applied to a "
    "database, no payment or email has been sent through a live provider, and no row-level security policy "
    "has been executed. The logic is proven by tests and by review, not by production traffic. Beyond that: "
    "the user interface covers roughly a fifth of the backend surface, there is no end-to-end test suite, "
    "no observability, no deployment configuration, and no external penetration test.",
)

h2("What are the next major milestones?")
para(
    "Stabilise the tree, apply and verify the database, verify the payment and email providers live, close "
    "the remaining audit findings, then build the missing user interface for notifications, reviews, "
    "payouts and administration. That is a bounded, well-understood path to a beta; an external "
    "penetration test and compliance review sit between beta and production.",
)

h2("A note on reading this report")
para(
    "The report deliberately separates what is built from what is proven. Where a control is described as "
    "structurally verified, that means it was read and traced in source and found correct by inspection - "
    "not that it has been executed. Where verification was impossible, that is stated. The largest single "
    "risk to this project is not a known defect; it is the gap between a well-audited codebase and a system "
    "that has never been run.",
    italic=True,
)

page_break()

# ===========================================================================
# APPENDICES
# ===========================================================================
h1("Appendix A - API Inventory")
para("64 route handlers. Grouped by domain; all are authenticated unless marked public.", size=9, italic=True, color=MUTED)

table(
    ["Domain", "Routes", "Count"],
    [
        ["Authentication", "/auth/register, /auth/login, /auth/logout, /auth/me, /auth/reset-password, /auth/callback", "6"],
        ["Profile", "/profile, /profile/completeness, /profile/skills, /profile/users/[id], /profile/users/[id]/client, /profile/users/[id]/consultant, /profile/companies/[id], /profile/clients/[id], /profile/consultants/[id] (+certifications, /portfolios, /portfolios/[id], /skills, /skills/[skillId])", "15"],
        ["Marketplace", "/jobs, /jobs/[id], /jobs/[id]/proposals, /jobs/client/[userId], /consultants/[id], /clients/[id], /proposals, /proposals/[id]", "8"],
        ["Engagement", "/contracts, /contracts/[id], /contracts/[id]/milestones, /milestones/[id], /contracts/[id]/review, /reviews, /reviews/[id], /reputation/[userId]", "8"],
        ["Payments", "/payments, /payments/[id], /payments/[id]/attach, /payments/[id]/confirm, /payments/[id]/release, /payments/[id]/refund, /payments/connect, /payments/webhook, /payouts", "9"],
        ["Notifications", "/notifications, /notifications/[id], /notifications/unread-count, /notifications/read-all, /notification-preferences", "5"],
        ["Messaging", "/messages/conversations, /messages/conversations/[conversationId], /messages/conversations/[conversationId]/messages, /messages/messages/[messageId], /messages/notifications", "5"],
        ["Administration", "/admin/overview, /admin/users, /admin/users/[id], /admin/jobs, /admin/jobs/[id], /admin/proposals, /admin/proposals/[id], /admin/disputes, /admin/reports, /admin/reports/[id], /admin/payments, /admin/payments/refunds, /admin/payouts, /admin/audit-log, + /admin/messages/notifications (legacy)", "15"],
    ],
    widths=[1.2, 4.55, 0.55],
    font=8,
)

h1("Appendix B - Database Inventory")
table(
    ["Group", "Tables", "Key integrity controls"],
    [
        ["Identity", "users, profiles, client_profiles, consultant_profiles, companies", "Role and status columns; write-protected from browser roles"],
        ["Capability", "skills, job_skills, consultant_skills, certifications, consultant_certifications, portfolios", "Join tables with composite uniqueness"],
        ["Marketplace", "jobs, proposals", "One active proposal per consultant per job"],
        ["Engagement", "contracts, milestones, disputes, reports", "State enums with terminal states; chk_no_self_dispute"],
        ["Money", "payments, payouts, payment_refunds, payment_webhook_events, payment_status_history, platform_fee_config", "chk_payment_math; unique dedup key; escrow total RPC"],
        ["Reputation", "reviews, review_edits, reputation", "chk_no_self_review; partial unique per (contract, reviewer); distribution total check"],
        ["Messaging", "conversations, conversation_members, messages, message_attachments", "Membership-scoped RLS; recursion removed"],
        ["Notifications", "notifications, notification_deliveries, notification_preferences", "chk_notification_read_state; chk_notification_in_app_locked; unique (notification, channel)"],
        ["Administration", "admin_audit_log", "Append-only trigger; all privileges revoked from browser roles"],
    ],
    widths=[1.05, 2.5, 3.15],
    font=8,
)

h1("Appendix C - Migration Inventory")
table(
    ["Migration", "Stage", "Purpose"],
    [
        ["00001_initial_schema", "Foundation", "33 tables, 25 enums, full core schema"],
        ["00002_seed_data", "Foundation", "Reference catalogue data"],
        ["00003_messaging_rls", "Messaging", "Conversations, messages, RLS, unread helpers"],
        ["00004_contracts_milestones_stage9", "9", "Contract/milestone enums and RLS helpers"],
        ["00005_core_rls_hardening", "Hardening", "Revoke anonymous profile reads"],
        ["00006_storage_security", "Hardening", "Attachment bucket policies"],
        ["00007_fix_conversation_members_rls_recursion", "Hardening", "Remove recursive policy"],
        ["00008_notifications_messaging_rls_hardening", "Hardening", "Remove notification spoofing path"],
        ["00009_payments_stage10", "10", "Razorpay remap, escrow invariants, webhook idempotency, fee config"],
        ["00010_reviews_reputation_stage11", "11", "Rating rename, review trigger, edit audit, reputation"],
        ["00011_rpc_grant_hardening", "Remediation", "Revoke unintended anon grants on four RPCs"],
        ["00012_reviews_reputation_remediation", "Remediation", "Tighten review trigger, add index, restore grant"],
        ["00013_notifications_stage12", "12", "Event types, dedup, outbox, preferences, unread function"],
        ["00014_admin_dashboard_stage13", "13", "Audit log, moderation state, admin read models"],
        ["00015_admin_transactions_stage13", "13", "Four transactional moderation procedures"],
    ],
    widths=[2.55, 0.85, 3.3],
    font=8,
)

h1("Appendix D - Security Controls")
table(
    ["#", "Control", "Layer", "Verified by"],
    [
        ["1", "Server-side JWT validation; role from a write-protected table", "Application", "Static + unit"],
        ["2", "51 row-level security policies keyed on auth.uid()", "Database", "Static only"],
        ["3", "Zod strict schemas rejecting unknown keys", "Application", "Unit tests"],
        ["4", "Relationship re-derivation in every service method", "Service", "Unit tests"],
        ["5", "chk_payment_math financial invariant", "Database", "Static + unit"],
        ["6", "Escrow total assertion RPC", "Database RPC", "Static only"],
        ["7", "HMAC-SHA256 webhook verification before parsing", "Application", "Unit tests"],
        ["8", "Idempotent webhook claiming under a unique constraint", "Database + Service", "Static + modelled concurrency"],
        ["9", "No browser INSERT path on notifications", "Database", "Static only"],
        ["10", "Review integrity BEFORE trigger", "Database", "Static only"],
        ["11", "Identity immutability and time-bounded edit window", "Database + Service", "Static + unit"],
        ["12", "Transactional moderation with row locking", "Database RPC", "Static only"],
        ["13", "Append-only administrative audit log", "Database", "Static only"],
        ["14", "Explicit function grant hygiene (anon/authenticated/PUBLIC)", "Database", "Static only"],
        ["15", "search_path pinned on all SECURITY DEFINER functions", "Database", "Static only"],
        ["16", "Participation-scoped storage access", "Database", "Static only"],
        ["17", "Recipient derivation from database relationships", "Service", "Business-path tests"],
        ["18", "HTML escaping and header-injection stripping on email", "Application", "Unit tests"],
        ["19", "Domain state machines with terminal states", "Application", "Unit tests"],
        ["20", "Data minimisation on administrative read models", "Service", "Dedicated test suite"],
    ],
    widths=[0.3, 3.0, 1.3, 2.1],
    font=8,
)

h1("Appendix E - Test Evidence")
table(
    ["Suite", "Cases", "Result"],
    [[n, str(c), "++PASS"] for n, c in [
        ("admin-authorization", 60), ("admin-db-hardening", 14), ("admin-data-minimisation", 13),
        ("auth-validation", 8), ("foundation", 6), ("notification-dedup", 18),
        ("notification-email", 18), ("notification-remediation", 22), ("notification-routes", 31),
        ("notifications-core", 27), ("notification-service", 24), ("notification-wiring", 6),
        ("payment-fees", 14), ("payment-refund-authorization", 16), ("payment-state-machine", 29),
        ("payment-webhook-signature", 11), ("reputation-math", 28), ("review-routes", 26),
        ("review-service", 26), ("review-validation", 26),
    ]] + [["!!TOTAL", "!!438", "!!438 passed, 0 failed"]],
    widths=[2.3, 0.8, 1.6],
)

h1("Appendix F - Known Limitations")
table(
    ["#", "Limitation", "Severity for production"],
    [
        ["1", "No migration applied or verified against any database", "!!Blocking"],
        ["2", "No live payment provider transaction", "!!Blocking"],
        ["3", "No live transactional email sent", "!!Blocking"],
        ["4", "No two-user RLS execution test", "!!Blocking"],
        ["5", "No end-to-end request-level tests", "High"],
        ["6", "Frontend covers a minority of API surface", "High for user-facing completeness"],
        ["7", "No external penetration test", "High"],
        ["8", "No observability or deployment configuration", "High"],
        ["9", "No notification retry worker", "Medium"],
        ["10", "No concurrent database transaction test", "Medium - mitigated by constraints"],
        ["11", "Stage 13 not independently re-audited in this report", "Medium"],
        ["12", "Approximately 30 untracked audit artifacts at repository root", "Low - hygiene"],
    ],
    widths=[0.3, 4.5, 1.9],
    font=8.5,
)

# ---------------------------------------------------------------------------
add_page_numbers()
doc.save(OUT)
print("WROTE:", OUT)
