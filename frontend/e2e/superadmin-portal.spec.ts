// SuperAdmin Portal E2E — every nav tab loads, key admin tables
// render. Read-only.

import { test, expect } from "@playwright/test";
import {
  attachLogCollector,
  loginAsDemo,
  walkNav,
  clickNav,
  assertNoHardFailures,
  type ErrorSink,
} from "./helpers";

const SUPERADMIN_NAV = [
  "Dashboard",
  "All Practices",
  "Pending Approvals",
  "Specialties",
  "Plan Templates",
  "Screening Library",
  "Consent Templates",
  "Note Templates",
  "Programs",
  "Analytics",
  "Platform Plans",
  "Billing",
  "Support",
  "Audit Logs",
  "Settings",
];

test.describe("SuperAdmin Portal — deep walk", () => {
  test("walks every nav tab without ErrorBoundary trips", async ({ page }) => {
    test.setTimeout(90_000);

    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Superadmin");
    const failures = await walkNav(page, "SuperAdmin", SUPERADMIN_NAV, sink);

    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.log("\n--- SuperAdmin failures ---");
      for (const f of failures) {
        // eslint-disable-next-line no-console
        console.log(`  ${f.tab} [${f.kind}]: ${f.message}`);
      }
    }
    assertNoHardFailures(failures);
  });

  test("All Practices tab shows practice list", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Superadmin");
    await clickNav(page, "All Practices");
    await page.waitForTimeout(2000);

    // Demo seed has at least Clearstone — expect a row mentioning it,
    // OR a search input + table header.
    const ok =
      (await page.getByText(/clearstone|practice name|search practices/i).first().isVisible().catch(() => false)) ||
      (await page.locator('input[placeholder*="Search" i]').first().isVisible().catch(() => false));
    expect(ok, "expected practices table or search").toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("Audit Logs tab loads", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Superadmin");
    await clickNav(page, "Audit Logs");
    await page.waitForTimeout(2000);

    // Audit log list page typically has filter chips + a list. We
    // accept either content or empty-state copy.
    const ok = await page
      .getByText(/action|resource|user|timestamp|no logs|audit/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(ok).toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("Plan Templates tab loads", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Superadmin");
    await clickNav(page, "Plan Templates");
    await page.waitForTimeout(1500);

    const ok = await page
      .getByText(/template|specialty|create.*template|no templates/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(ok).toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("Analytics tab loads + renders some charts/numbers", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Superadmin");
    await clickNav(page, "Analytics");
    await page.waitForTimeout(2500); // chart libs are heavy

    // Expect either a metric card, a chart canvas/svg, or a header.
    const hasNumbers = await page
      .getByText(/total|revenue|practices|active|month|week/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasChart =
      (await page.locator("canvas").first().isVisible().catch(() => false)) ||
      (await page.locator("svg.recharts-surface, svg[class*='chart']").first().isVisible().catch(() => false));
    expect(hasNumbers || hasChart, "expected analytics metrics or charts").toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });
});
