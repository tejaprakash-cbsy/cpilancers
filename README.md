# SAP Integration Services Freelance Marketplace

## Project Overview

A specialized B2B freelance marketplace connecting enterprise clients with elite SAP Cloud Integration (CPI) and SAP Integration Suite consultants. Built with Next.js 15+, React 19, TypeScript, Tailwind CSS, and Supabase PostgreSQL.

## Technology Stack

### Frontend
- **Framework:** Next.js 16.3.5 (App Router)
- **UI Library:** React 19.2.8
- **Language:** TypeScript 5+
- **Styling:** Tailwind CSS 4
- **Icons:** Lucide React
- **Utilities:** clsx, tailwind-merge

### Backend & Database
- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth (@supabase/ssr)
- **ORM:** Supabase Client SDK
- **Storage:** Supabase Storage (for file uploads)
- **Real-time:** Supabase Realtime (for messaging)

### Infrastructure & Tooling
- **Validation:** Zod
- **Code Quality:** ESLint
- **Git Hooks:** (To be configured)
- **Testing:** Jest types (framework TBD)

## Project Structure

```
sap-integration-marketplace/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout with Header/Footer
│   │   ├── page.tsx                  # Homepage
│   │   ├── error.tsx                 # Error boundary
│   │   ├── not-found.tsx             # 404 page
│   │   ├── loading.tsx               # Loading state
│   │   └── globals.css               # Global styles with design tokens
│   │
│   ├── components/
│   │   ├── ui/                       # Base UI components
│   │   │   ├── button.tsx            # Primary button component
│   │   │   ├── badge.tsx             # SAP-themed badges
│   │   │   ├── card.tsx              # Card component system
│   │   │   ├── input.tsx             # Form input with validation states
│   │   │   ├── loading.tsx           # Loading spinners & states
│   │   │   ├── alert.tsx             # Alert & toast notifications
│   │   │   └── index.ts              # Barrel export
│   │   │
│   │   ├── layout/                   # Layout components
│   │   │   ├── header.tsx            # Main navigation header
│   │   │   └── footer.tsx            # Site footer
│   │   │
│   │   ├── forms/                    # Form components (future)
│   │   └── features/                 # Feature-specific components (future)
│   │
│   ├── lib/
│   │   ├── supabase/                 # Supabase client configurations
│   │   │   ├── client.ts             # Browser client
│   │   │   ├── server.ts             # Server component client
│   │   │   ├── middleware.ts         # Session refresh middleware
│   │   │   └── admin.ts              # Service role client
│   │   │
│   │   ├── utils/                    # Utility functions
│   │   │   └── index.ts              # cn(), formatCurrency(), formatDate(), etc.
│   │   │
│   │   ├── validations/              # Zod schemas (future)
│   │   └── errors.ts                 # Custom error classes
│   │
│   ├── services/                     # Business logic services
│   │   ├── base.service.ts           # Abstract base service
│   │   └── auth.service.ts           # Authentication service stub
│   │
│   ├── hooks/                        # Custom React hooks
│   │   └── index.ts                  # useToggle, useDebounce, useLocalStorage
│   │
│   ├── types/                        # TypeScript type definitions
│   │   ├── database.ts               # Database table interfaces
│   │   ├── env.d.ts                  # Environment variable types
│   │   └── index.ts                  # Shared types & exports
│   │
│   ├── config/                       # Configuration modules
│   │   └── env.ts                    # Environment validation with Zod
│   │
│   ├── middleware.ts                 # Next.js middleware (session management)
│   └── tests/                        # Test files (excluded from build)
│       └── foundation.test.ts        # Foundation tests
│
├── database/
│   └── migrations/                   # SQL migration files
│       ├── 00001_initial_schema.sql  # Complete database schema
│       └── 00002_seed_data.sql       # Initial seed data (skills, certs)
│
├── public/                           # Static assets
│   └── [Next.js default assets]
│
├── .env.example                      # Environment variable template
├── .env.local                        # Local development variables (git ignored)
├── .env.development                  # Development environment
├── .env.staging                      # Staging environment
├── .env.production                   # Production environment
│
├── next.config.ts                    # Next.js configuration
├── tsconfig.json                     # TypeScript configuration
├── tailwind.config.ts                # Tailwind CSS configuration
├── postcss.config.mjs                # PostCSS configuration
├── eslint.config.mjs                 # ESLint configuration
├── package.json                      # Dependencies and scripts
└── README.md                         # This file
```

## Getting Started

### Prerequisites

- **Node.js:** v18.x or higher (v20+ recommended)
- **npm:** v9.x or higher
- **Supabase Account:** Free tier is sufficient for development

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd sap-integration-marketplace
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```

4. **Configure Supabase:**
   - Create a new Supabase project at https://supabase.com
   - Copy your project URL and anon key
   - Update `.env.local`:
     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
     ```

5. **Run database migrations:**
   - Open Supabase SQL Editor
   - Execute `database/migrations/00001_initial_schema.sql`
   - Execute `database/migrations/00002_seed_data.sql`

6. **Start development server:**
   ```bash
   npm run dev
   ```

7. **Open browser:**
   Navigate to http://localhost:3000

### Verify Installation

✅ **Homepage loads** with SAP-themed UI  
✅ **No TypeScript errors** in terminal  
✅ **Header and Footer** render correctly  
✅ **Tailwind CSS** styling applied  
✅ **Responsive design** works on mobile/tablet/desktop  

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (http://localhost:3000) |
| `npm run build` | Build production-optimized bundle |
| `npm run start` | Start production server (requires `npm run build` first) |
| `npm run lint` | Run ESLint for code quality checks |

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (public) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_NAME` | Application name | `SAP Integration Marketplace` |
| `NEXT_PUBLIC_APP_URL` | Application URL | `http://localhost:3000` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe public key (for payments) | - |
| `STRIPE_SECRET_KEY` | Stripe secret key (server-only) | - |
| `SENDGRID_API_KEY` | Email service API key | - |
| `EMAIL_FROM` | Default sender email | `noreply@sapintegration.com` |

## Design System

### Color Palette

The application uses a professional SAP enterprise color scheme:

- **Primary (Navy Blue):** `#0a4d8c` - Main CTA buttons, headers
- **Secondary (Cyan):** `#0284c7` - Accents, secondary actions
- **Success:** `#10b981` - Positive states, approvals
- **Warning:** `#f59e0b` - Warnings, pending states
- **Danger:** `#ef4444` - Errors, destructive actions

### Typography

- **Font Stack:** System fonts for optimal performance
- **Headings:** Bold, tracking-tight for hierarchy
- **Body:** Regular weight, comfortable line-height

### Component Guidelines

All UI components follow:
- **Accessibility:** WCAG 2.1 AA compliant
- **Responsive:** Mobile-first design
- **Consistent:** Unified spacing, shadows, borders
- **SAP-Themed:** Enterprise B2B aesthetic

## Database Schema

The database consists of 25 tables organized into:

### Core Entities
- `users`, `profiles`, `companies`
- `client_profiles`, `consultant_profiles`

### Skills & Credentials
- `skills`, `consultant_skills`
- `certifications`, `consultant_certifications`
- `portfolios`

### Marketplace Transactions
- `jobs`, `job_skills`, `proposals`
- `contracts`, `milestones`
- `payments`, `payouts`

### Communication
- `conversations`, `conversation_members`
- `messages`, `message_attachments`

### Trust & Safety
- `reviews`, `disputes`, `reports`, `notifications`

See `database/migrations/00001_initial_schema.sql` for complete schema.

## Development Roadmap

### ✅ Phase 0: Foundation (Current)
- [x] Project structure
- [x] TypeScript configuration
- [x] Tailwind CSS setup
- [x] Supabase integration
- [x] Base UI components
- [x] Layout components
- [x] Error handling
- [x] Loading states
- [x] Database schema

### 🚧 Phase 1: Authentication (Next)
- [ ] User registration (client/consultant)
- [ ] Email verification
- [ ] Login/logout
- [ ] Password reset
- [ ] Protected routes
- [ ] Role-based access control

### 📋 Phase 2: User Profiles
- [ ] Client company profile
- [ ] Consultant profile
- [ ] Skills management
- [ ] Certification upload
- [ ] Portfolio showcase

### 📋 Phase 3: Job Marketplace
- [ ] Job posting (clients)
- [ ] Job browsing (consultants)
- [ ] Job search & filters
- [ ] Proposal submission
- [ ] Proposal review

### 📋 Phase 4: Contracts & Payments
- [ ] Contract creation
- [ ] Milestone management
- [ ] Stripe Connect integration
- [ ] Escrow payments
- [ ] Payout processing

### 📋 Phase 5: Communication & Reviews
- [ ] Real-time messaging
- [ ] Notification system
- [ ] Review system
- [ ] Dispute resolution

### 📋 Phase 6: Admin Dashboard
- [ ] User management
- [ ] Content moderation
- [ ] Analytics & reports
- [ ] Financial oversight

## Security Considerations

### Current Implementation
- ✅ Environment variables for secrets
- ✅ TypeScript strict mode
- ✅ Server-side session management
- ✅ Input validation (Zod)
- ✅ Custom error handling
- ✅ HTTPS enforced (production)

### Future Enhancements
- [ ] Rate limiting
- [ ] CSRF protection
- [ ] SQL injection prevention (via Supabase ORM)
- [ ] XSS protection
- [ ] Row-level security policies
- [ ] Payment security (PCI compliance via Stripe)

## Contributing

Guidelines will be added when the project opens for contributions.

## License

Proprietary - All rights reserved.

## Support

For technical support or questions, contact: [To be determined]

---

**Built with ❤️ for the SAP Integration Community**

Last Updated: September 22, 2026
