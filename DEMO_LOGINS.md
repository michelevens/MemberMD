# Demo Logins

Test credentials for clicking through the live application as each role.
All demo data is seeded by `DemoSeeder.php`.

## Run the seeder

```bash
cd laravel-backend
SEED_DEMO=1 php artisan db:seed
```

The seeder is **idempotent** — safe to re-run. It wipes its own tenant
(`tenant_code = CLRSTN`) before re-seeding, so prior demo data doesn't
accumulate.

To wipe and re-seed from scratch on Railway:

```bash
SEED_DEMO=1 php artisan db:seed --force
```

`--force` is required in production (Railway) to skip the interactive prompt.

---

## Logins

All demo passwords are `demo` (except superadmin which keeps the existing
`MemberMD2026` for compatibility with the original DatabaseSeeder).

### Superadmin

Sees the platform-wide dashboard, all practices, Tier 1 SaaS billing.

| Field | Value |
|---|---|
| Email | `super@membermd.io` |
| Password | `MemberMD2026` |
| Role | superadmin |

### Practice Admin

Sees the entire Clearstone Psychiatry tenant — clinical, billing, team,
settings.

| Field | Value |
|---|---|
| Email | `admin@clearstone.test` |
| Password | `demo` |
| Role | practice_admin |

### Provider

Clinical-only surface — encounters, prescriptions, screenings, vitals.
No billing or team management.

| Field | Value |
|---|---|
| Email | `provider@clearstone.test` |
| Password | `demo` |
| Role | provider |

### Staff

Operational — appointments, intakes, communications, activity log.
No clinical surface, no billing.

| Field | Value |
|---|---|
| Email | `staff@clearstone.test` |
| Password | `demo` |
| Role | staff |

### Patient

Patient portal for **James Wilson** — appointments, billing tab, health
records, messages.

| Field | Value |
|---|---|
| Email | `patient1@clearstone.test` |
| Password | `demo` |
| Role | patient |

---

## What's seeded

**Practice:** Clearstone Psychiatry (`tenant_code = CLRSTN`).

**Plans:**
- **Starter** — $79/mo, 14-day trial, 2 visits/mo
- **Wellness** — $99/mo, 4 visits/mo
- **Complete** — $199/mo, 12 visits/mo, family-eligible
- **Concierge** — $399/mo, unlimited visits, family-eligible
- **Family** — $349/mo, 24 shared visits/mo

**Patients (~30):**
- 12 active individual members at various plan tiers, billing frequencies
- 2 family primaries, 4 dependents (Marco/Sofia Garcia, Diego/Isabella Martinez)
- 4 trial members (mid-trial, days 5-9 of 14)
- 3 past_due (failed last invoice, dunning will pick them up)
- 3 cancelled (cost / moved / dunning_non_payment)
- 2 paused
- 4 employer-sponsored (Acme Co)

**Employer:** Acme Co with 4 active employees, eligibility periods open
since 4 months ago.

**Clinical history (per active patient):**
- 4-6 encounters with SOAP notes signed by Dr. Sarah Chen
- 1 active Sertraline 100mg prescription
- 6-month PHQ-9 trend (18 → 6, improving)

**Billing history (per non-trial active patient):**
- 6 months of paid invoices + payments at the plan's monthly price
- Past_due patients have one open pending invoice 8 days overdue

**Pending state:**
- 1 scheduled cancel (effective +2 months, "committed_period_ending")
- 1 scheduled plan change (Complete → Wellness, effective +1 month)
- 2 unapplied membership credits ($50 comp, $25 write-off)

---

## Walking through a demo

A natural flow:

1. **Login as `admin@clearstone.test`** → see dashboard with MRR, member counts
2. Go to **Patient Roster** — 30 patients across all states
3. Click **James Wilson** → see his chart (encounters, screenings, billing)
4. Click **Recent Activity** tab → vertical timeline across all patients
5. Go to **Calendar** → drag-and-drop appointments between days
6. Go to **Settings → Practice Settings** → 11 tabs including Clinical Config
7. Logout, **login as `patient1@clearstone.test`** → see the patient portal
8. Click **Billing & Account** → trial banner if applicable, plan card with
   visits-used progress, invoice history, "Manage Cards" + "Cancel" actions

---

## Troubleshooting

**Seeder fails with FK violation:** Run migrations first:
```bash
php artisan migrate
```

**Seeder runs but app shows nothing:** Confirm you logged in as a user with
`tenant_id` matching the seeded practice. Patient logins are scoped to their
own data only.

**Need to wipe and start over:**
```bash
php artisan migrate:fresh --seed
SEED_DEMO=1 php artisan db:seed
```

`migrate:fresh` drops all tables; `db:seed` re-runs the master-data
seeders. The second `db:seed` with `SEED_DEMO=1` adds the demo tenant.
