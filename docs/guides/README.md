# MemberMD User Guides

Use-case playbooks for every role that touches the platform. Organized by **job to be done**, not by feature — find your role, then find the job you're trying to get done.

Each playbook follows the same shape so a new user can skim and act:

> **Trigger** — what makes this job start
> **Outcome** — what "done" looks like
> **Where** — screens and routes involved
> **Steps** — numbered, with the actual buttons to click
> **Watch-outs** — gotchas, edge cases, common mistakes
> **Related jobs** — links to the next thing you'll typically need

## Personas

| Persona | What they do | Where they live |
|---|---|---|
| [Superadmin](./01-superadmin/) | Platform operator — runs the tenant fleet, master data, fleet-wide audits | `/superadmin` |
| [Practice Admin](./02-practice-admin/) | Owns the practice — plans, pricing, staff, providers, branding, billing health | `/practice` (all tabs) |
| [Provider](./03-provider/) | Clinical user — sees patients, runs telehealth, writes encounters, prescribes | `/practice` (Clinical + Communications) |
| [Staff](./04-staff/) | Non-clinical practice user — intake, roster triage, payments, communications | `/practice` (Members + Billing + Communications + Operations) |
| [Patient](./05-patient/) | Member — enrolls, pays, messages care team, views records, manages family | `/patient`, plus `/enroll/<TENANT>` and `/sign/<token>` |
| [Employer Admin](./06-employer-admin/) | Sponsoring company HR — manages sponsored roster + sponsor invoices | `/employer` |

## Conventions used in these guides

- **Routes** are written as `/dashboard`, `/practice?tab=billing`, etc. — paste into the browser after `app.membermd.io/#`.
- **Roles in the practice portal**: A single practice can have admins, providers, and staff. They share `/practice` but see different tabs — playbooks call this out where it matters.
- **Demo logins** for every scenario referenced live in [DEMO_LOGINS.md](../../DEMO_LOGINS.md). Use them to walk through any playbook without touching real data.
- **Tenants**: Every practice has its own `tenant_code` (e.g. `CLRSTN`). Patients enroll via `/enroll/<TENANT_CODE>`. Public payment / signature pages key off opaque tokens.
- **Branded artifacts**: Statements, e-signature pages, and member emails are branded with the practice's logo + primary color (set in Settings → Branding).

## Where help lives at runtime

These markdown files are the **source of truth** for staff onboarding and internal reference. The end-user runtime help center (the Help button in every portal's top bar) is database-backed (`/help/*` API → `HelpCenterModal`) and is curated separately. When a workflow described here matters to end users, mirror the relevant chunk into a Help Center article — the playbook stays canonical, the article is the user-facing extract.

## How to update these guides

These are markdown files in `/docs/guides/` — edit them like any other source file. When you ship a feature that changes a workflow, update the playbook in the same PR. Guides drift fast otherwise.

For new playbooks: copy [`_template.md`](./_template.md) and fill it in.

## Roadmap

- [ ] Mount these in-app behind a `/help/guides` route with markdown rendering + left-nav.
- [ ] Generate role-specific PDF "first-week checklist" for new hires from these sources.
- [ ] Seed the runtime Help Center DB from the patient + employer-admin playbooks (those are the only roles that need self-serve help; staff and providers learn on the job from a manager).
