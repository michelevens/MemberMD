# MemberMD — DPC Membership Platform for Medical Practices

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui
- **Backend**: Laravel 12 + PHP 8.4 + PostgreSQL
- **Auth**: Laravel Sanctum (token-based)
- **Email**: Resend
- **Payments**: Stripe (subscriptions, Connect, webhooks)
- **Telehealth**: Daily.co (Phase 2)
- **Deployment**: Railway (backend) + GitHub Pages (frontend)

## Critical Rules
- **NO arbitrary Tailwind values**: No bg-[#hex], text-[11px]. Use style={{}} instead.
- **Build must pass**: cd frontend && npm run build — zero errors before any commit
- **HashRouter**: React Router uses HashRouter, not BrowserRouter
- **UUID primary keys**: All models use UUID (HasUuids trait)
- **Multi-tenant**: All data scoped via tenant_id + BelongsToTenant trait
- **Auditable**: Critical models use Auditable trait for HIPAA compliance

## User Roles
superadmin, practice_admin, provider, staff, patient

## Frontend Port: 5173
## Backend Port: 8000

## Git
- Branch: main (direct push)
- Railway auto-deploys from main
