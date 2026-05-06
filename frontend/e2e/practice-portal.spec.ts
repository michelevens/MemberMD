// Practice Portal E2E — every nav tab loads. Practice Admin role has
// the broadest sidebar, so this covers the union of provider + staff
// nav too. We also do a smaller walk as Provider + Staff to verify
// the role-filtered views render.
//
// Read-only. No CRUD.

import { test, expect } from "@playwright/test";
import {
  attachLogCollector,
  loginAsDemo,
  walkNav,
  clickNav,
  assertNoHardFailures,
  type ErrorSink,
} from "./helpers";

const PRACTICE_ADMIN_NAV = [
  "Dashboard",
  "Programs",
  "Patient Roster",
  "Intake Submissions",
  "Waitlist",
  "Appointments",
  "Telehealth",
  "Encounters",
  "Prescriptions",
  "Screenings",
  "Lab Orders",
  "Referrals",
  "Care Coordination",
  "Recent Activity",
  "Membership Plans",
  "Invoices",
  "Payments",
  "Coupons",
  "Revenue Analytics",
  "Payment Recovery",
  "Employers",
  "Providers",
  "Staff",
  "Inventory",
  "Communications",
  "Activity Log",
  "À La Carte",
  "Messages",
  "Notifications",
  "Patient Engagement",
  "Provider Analytics",
  "HIPAA & Audit",
  "Practice Settings",
  "Branding",
];

const PROVIDER_NAV = [
  "Dashboard",
  "Patient Roster",
  "Appointments",
  "Telehealth",
  "Encounters",
  "Prescriptions",
  "Screenings",
  "Lab Orders",
  "Referrals",
  "Care Coordination",
  "Messages",
  "My Profile",
];

const STAFF_NAV = [
  "Dashboard",
  "Patient Roster",
  "Intake Submissions",
  "Waitlist",
  "Appointments",
  "Membership Plans",
  "Invoices",
  "Payments",
  "Coupons",
  "Payment Recovery",
  "Employers",
  "Inventory",
  "Communications",
  "Messages",
];

test.describe("Practice Portal — Practice Admin", () => {
  test("walks every nav tab without ErrorBoundary trips", async ({ page }) => {
    test.setTimeout(240_000); // long sidebar + possible login backoff

    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Practice Admin");
    const failures = await walkNav(page, "PracticeAdmin", PRACTICE_ADMIN_NAV, sink);

    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.log("\n--- Practice Admin failures ---");
      for (const f of failures) {
        // eslint-disable-next-line no-console
        console.log(`  ${f.tab} [${f.kind}]: ${f.message}`);
      }
    }
    assertNoHardFailures(failures);
  });

  test("Patient Roster tab shows patients table or empty state", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Practice Admin");
    await clickNav(page, "Patient Roster");
    await page.waitForTimeout(1500);

    // Either a search input + list, or an empty state. The seeded demo
    // has patients, so we expect search + at least one row.
    const search = page
      .locator('input[placeholder*="Search" i], input[type="search"]')
      .first();
    const found = await search.isVisible().catch(() => false);
    expect(found, "expected a search input on the Patient Roster").toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("Membership Plans tab renders plan list", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Practice Admin");
    await clickNav(page, "Membership Plans");
    await page.waitForTimeout(1500);

    // Expect either a plan list (cards/table) or a "Create your first
    // plan" empty state. Demo seed includes plans.
    const ok = await page
      .getByText(/monthly|annually|enrollment fee|create.*plan|no plans/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(ok, "expected plan list or empty state").toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("Appointments tab renders calendar or list view", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Practice Admin");
    await clickNav(page, "Appointments");
    await page.waitForTimeout(2000);

    // Calendar shows day/week/month controls or appointments list.
    const ok = await page
      .getByText(/today|week|month|calendar|appointments|schedule/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(ok).toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("Practice Settings tab loads", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Practice Admin");
    await clickNav(page, "Practice Settings");
    await page.waitForTimeout(1500);

    const ok = await page
      .getByText(/practice name|timezone|hours|specialty|general|billing/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(ok).toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });
});

test.describe("Practice Portal — Provider", () => {
  test("walks provider-scoped nav without errors", async ({ page }) => {
    test.setTimeout(180_000); // includes possible login throttle backoff

    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Provider");
    const failures = await walkNav(page, "Provider", PROVIDER_NAV, sink);

    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.log("\n--- Provider failures ---");
      for (const f of failures) {
        // eslint-disable-next-line no-console
        console.log(`  ${f.tab} [${f.kind}]: ${f.message}`);
      }
    }
    assertNoHardFailures(failures);
  });
});

test.describe("Practice Portal — Staff", () => {
  test("walks staff-scoped nav without errors", async ({ page }) => {
    test.setTimeout(180_000); // includes possible login throttle backoff

    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Staff");
    const failures = await walkNav(page, "Staff", STAFF_NAV, sink);

    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.log("\n--- Staff failures ---");
      for (const f of failures) {
        // eslint-disable-next-line no-console
        console.log(`  ${f.tab} [${f.kind}]: ${f.message}`);
      }
    }
    assertNoHardFailures(failures);
  });
});
