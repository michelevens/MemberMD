# Demo & Test Logins

Reference for QA, demos, and walkthroughs. **All scenarios are test-mode
only — no real money, no real patients.** Each scenario produces its own
tenant; tenants coexist without interfering.

## Quick start

```bash
# List available scenarios
php artisan demo:scenario --list

# Seed one
php artisan demo:scenario --name=clearstone

# Seed every scenario at once
php artisan demo:scenario --all

# Wipe one
php artisan demo:reset --name=churn

# Wipe everything
php artisan demo:reset --all
```

On Railway:

```bash
railway ssh --service MemberMD
cd /app && php artisan demo:scenario --list
```

---

## Universal logins

| Field | Value |
|---|---|
| **Superadmin** (platform-wide) | `super@membermd.io` / `MemberMD2026` |
| **Practice admin** (per scenario) | `admin@<tenant>.test` / `demo` |
| **Provider** (per scenario) | `provider@<tenant>.test` / `demo` |
| **Staff** (per scenario) | `staff@<tenant>.test` / `demo` |
| **Patient** (per scenario, where seeded) | usually `<first>.<last>@<tenant>.test` / `demo` |

Each scenario has its own email domain — e.g. `admin@clrstn.test`, `admin@dunn1.test`, etc.

---

## Test scenarios

| Key | Tenant code | Domain | Description |
|---|---|---|---|
| `clearstone` | `CLRSTN` | `clrstn.test` | Broad walkthrough — 30 patients across every lifecycle state, family, employer, billing history. **Stripe Connect already wired** (`acct_1TRxkEINgfqoMqMa`). |
| `fresh` | `FRESH1` | `fresh1.test` | Brand-new tenant — admin only, no plans, no patients. Tests practice onboarding flow. |
| `dunning` | `DUNN1` | `dunn1.test` | Heavy past_due cohort + active dunning events. Tests dunning executor, retry flows, smart retry. |
| `churn` | `CHURN1` | `churn1.test` | Mass cancellations split voluntary/involuntary + 2 trial abandonments. Tests churn analytics. |
| `employer` | `EMP1` | `emp1.test` | Acme Co with mixed tenure: long-time employees, mid-cycle joiners, terminations, retroactive corrections. |
| `family` | `FAM1` | `fam1.test` | Primaries with 0/1/2/3/4/5 dependents. Tests family cascades, quantity adjustments. |
| `trial` | `TRIAL1` | `trial1.test` | All members mid-trial at varying days remaining (13/10/7/5/3/1). |
| `refund` | `REFUND` | `refund.test` | Patients with full / partial / multi-refund states + active credits on file. |
| `versions` | `PVFLUX` | `pvflux.test` | Members locked at plan v1 prices while plan v2 is current. Tests price-snapshot integrity. |
| `scheduled` | `SCHED1` | `sched1.test` | Members with future-dated cancels/downgrades + one overdue scheduled change. |

---

## Registration / enrollment wizards (already in app)

### Practice registration (Tier 1 — practice signs up to MemberMD)

- **Route:** [https://app.membermd.io/#/register](https://app.membermd.io/#/register)
- **Frontend:** `frontend/src/components/auth/PracticeRegistration.tsx`
- **Backend:** `AuthController::register` (POST `/register`) — creates Practice + first admin User with `onboarding_completed=false`
- **Tests with:** `fresh` scenario (or just register a new tenant from scratch)

### Patient enrollment (Tier 2 — patient enrolls in a practice's DPC)

- **Route:** `https://app.membermd.io/#/enroll/<TENANT_CODE>` (e.g. `/enroll/CLRSTN`)
- **Frontend:** `frontend/src/components/widgets/EnrollmentWidget.tsx` — 6-step widget
- **Backend:** `ExternalController::enroll` (POST `/external/enroll/{tenantCode}`)
- **Idempotency:** wrapped in `IdempotencyService` — double-clicks coalesce
- **Active-membership uniqueness:** unique partial index on `(tenant_id, patient_id)` where `status='active'` — prevents duplicate active enrollments
- **Tests with:** any seeded scenario's tenant code, or via the public widget

---

## Walking through a demo

### Quickest path (5 min)

```bash
# Seed everything
php artisan demo:scenario --all

# See dashboards across role separation
# Login: admin@clrstn.test / demo → practice admin
# Login: super@membermd.io / MemberMD2026 → superadmin (sees all 10 tenants)
```

### Specific test paths

| Goal | Steps |
|---|---|
| Test enrollment widget | Visit `https://app.membermd.io/#/enroll/CLRSTN` |
| Test practice signup | Visit `https://app.membermd.io/#/register`; fill form |
| Test dunning flow | `demo:scenario --name=dunning` → login as `admin@dunn1.test` → run `php artisan dunning:process` → see emails sent + statuses change |
| Test trial countdown | `demo:scenario --name=trial` → login as `patient1@trial1.test` → see Billing tab countdown |
| Test family cascades | `demo:scenario --name=family` → login as `admin@fam1.test` → cancel a primary, see dependents cascade |
| Test refund + credit | `demo:scenario --name=refund` → admin issues a refund via patient detail → see ledger entry |
| Test plan version flux | `demo:scenario --name=versions` → see v1 members keep their old price while plan shows v2 |
| Test scheduled changes | `demo:scenario --name=scheduled` → run `php artisan memberships:process-scheduled-changes` → see overdue change apply |
| Test churn analytics | `demo:scenario --name=churn` → check `/api/reports/membership` for breakdown |
| Test mid-cycle employer billing | `demo:scenario --name=employer` → run sponsor invoice generator → see prorated headcount |

---

## Default patient logins per scenario

Most scenarios designate one patient with a portal login (password `demo`):

| Scenario | Patient login |
|---|---|
| `clearstone` | `james.wilson@clrstn.test` (active member) |
| `dunning` | `pastdue1.test@dunn1.test` (past_due) |
| `family` | `primary2deps.family@fam1.test` (primary with 2 deps) |
| `trial` | `trial7days.left@trial1.test` (mid-trial, 7 days remaining) |
| `refund` | `credit.holder@refund.test` (has $75 in credits) |
| `versions` | `v2member1.latest@pvflux.test` (v2 enrollee) |
| `scheduled` | `scheduled.cancel@sched1.test` (cancel pending) |

For scenarios without a designated patient login, all patient records exist
in the DB but you'll need to manually assign one a portal login (or use
the practice admin to view their portal-side data).

---

## Stripe (test mode)

- **Stripe account**: shared across all scenarios (test mode, single keypair)
- **Connect account for Clearstone**: `acct_1TRxkEINgfqoMqMa`
- **Stripe price IDs**: populated for Clearstone's 5 plans only — run `php artisan demo:wire-stripe --tenant=<CODE>` to wire each additional scenario's plans into Stripe
- **Webhooks**: Platform `we_1TRxmuIu9HZ5QC9gqHCmYAn2`, Connect `we_1TRxnIIu9HZ5QC9gJpRvBnS8`
- **Test cards**: `4242 4242 4242 4242` (succeeds) / `4000 0000 0000 9995` (declines) / `4000 0000 0000 0341` (succeeds then fails on renewal — for dunning testing). Full reference: [STRIPE_SETUP.md](STRIPE_SETUP.md).

Full Stripe setup runbook: [STRIPE_SETUP.md](STRIPE_SETUP.md).

---

## Adding a new scenario

1. Add a class extending `BaseScenario` in `laravel-backend/app/Services/Testing/Scenarios.php`
2. Implement `tenantCode()`, `tenantName()`, `description()`, `seed(ScenarioRunner $r)`
3. Register in `ScenarioRegistry::all()` at the bottom of that file
4. Add a row to the **Test scenarios** table above

The scenario gets its own tenant_code, its own logins, its own data shape — fully isolated.

---

## Troubleshooting

**"Could not open input file: artisan"** on Railway — the artisan binary lives at `/app/artisan` (not `/app/laravel-backend/artisan`). When SSH'd in: `cd /app && php artisan ...`.

**Seeder fails with FK violation** — run migrations first: `php artisan migrate`.

**Need to wipe everything and start over:**
```bash
php artisan demo:reset --all --force
php artisan demo:scenario --all
```
