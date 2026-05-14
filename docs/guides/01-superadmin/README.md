# Superadmin — Playbooks

You operate the MemberMD platform itself. You see across every practice tenant, can impersonate any of them, manage platform plans, audit cross-tenant activity, and own master data every practice inherits. With that reach comes a HIPAA-grade audit trail of everything you do.

Superadmin lives at `/superadmin` — a separate console from the practice/patient portals. Login: `super@membermd.io` / `MemberMD2026` (test env).

## Your week in 30 minutes

1. **Fleet dashboard** — tenant count, plan distribution, signups this week, MRR.
2. **Tenants** — anyone on trial near expiry, anyone in past-due.
3. **Audit Log** — sweep for unusual activity (mass exports, off-hours access, failed logins).
4. **System Health** — Stripe, Resend, Daily.co, LiveKit, queue backlog — anything degraded?

## The 5 jobs you do most

1. [Run the daily fleet health check](./01-fleet-health-check.md) — what's running, who's at risk
2. [Impersonate a tenant to investigate or assist](./02-impersonate-a-tenant.md) — with audit trail
3. [Onboard a new practice tenant manually](./03-onboard-practice.md) — when self-serve registration isn't enough
4. [Read the audit log for forensics](./04-audit-log.md) — when something happened
5. [Update platform plans and master data](./05-platform-plans-and-master-data.md) — the SaaS tiers practices subscribe to + global catalogs

## Strategic context

- The platform runs a **two-tier billing model**: practices pay you a SaaS subscription; patients pay practices a DPC membership. See [project_billing_model](../../../CLAUDE.md) and [WEDGE_STRATEGY.md](../../../WEDGE_STRATEGY.md) for framing.
- "Superadmin" is internal-only. Never give a customer a superadmin login. If they need cross-tenant visibility (e.g. a multi-site group), use Multi-Site tier instead.
