// Public surfaces E2E — unauthenticated routes a marketing-site visitor
// or unauth'd patient would hit. None of these require login.
//
// Covered:
//   - /#/login (auth screen)
//   - /#/forgot-password
//   - /#/register (practice registration)
//   - /#/plans/{tenant} (plan-comparison widget)
//   - /#/enroll/{tenant} (membership enrollment widget)
//   - /#/book/{tenant} (booking widget — also covered separately, light here)
//
// Read-only, no submits.

import { test, expect } from "@playwright/test";
import { attachLogCollector, type ErrorSink } from "./helpers";

const DEMO_TENANT = "CLRSTN";

test.describe("Public surfaces", () => {
  test("login screen renders without errors", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await page.goto("/#/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/sign in to your account/i)).toBeVisible({ timeout: 15_000 });

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("forgot-password screen renders", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await page.goto("/#/forgot-password", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const eb = page.getByText(/something went wrong/i);
    expect(await eb.isVisible().catch(() => false)).toBeFalsy();

    // At least an email input or "reset" / "forgot" header.
    const ok =
      (await page.locator('input[type="email"]').first().isVisible().catch(() => false)) ||
      (await page.getByText(/reset|forgot|recover/i).first().isVisible().catch(() => false));
    expect(ok, "expected email input or reset/forgot copy").toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("practice registration screen renders", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await page.goto("/#/register", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000); // bigger chunk

    const eb = page.getByText(/something went wrong/i);
    expect(await eb.isVisible().catch(() => false)).toBeFalsy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("plan comparison widget loads against demo tenant", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await page.goto(`/#/plans/${DEMO_TENANT}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const eb = page.getByText(/something went wrong/i);
    expect(await eb.isVisible().catch(() => false)).toBeFalsy();

    // Either plan cards render, or a "no public plans" empty state.
    const ok = await page
      .getByText(/monthly|annually|enroll|join|compare|no plans available|coming soon/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(ok, "expected plan widget content").toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("enrollment widget loads against demo tenant", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await page.goto(`/#/enroll/${DEMO_TENANT}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000); // widget fetches options + plans

    const eb = page.getByText(/something went wrong/i);
    expect(await eb.isVisible().catch(() => false)).toBeFalsy();

    // The enrollment widget shows the practice name + a step indicator
    // or a plan selector. Permissive match.
    const ok = await page
      .getByText(/clearstone|enroll|membership|select.*plan|coming soon/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(ok, "expected enrollment widget content").toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("booking widget loads against demo tenant", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await page.goto(`/#/book/${DEMO_TENANT}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const eb = page.getByText(/something went wrong/i);
    expect(await eb.isVisible().catch(() => false)).toBeFalsy();

    // Step bar shows "Visit / Time / Details" or visit-type/provider sections.
    const ok = await page
      .getByText(/visit type|provider|book|appointment|no public booking/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(ok, "expected booking widget content").toBeTruthy();

    expect(sink.pageErrors).toHaveLength(0);
  });

  test("invalid tenant code shows graceful error (not crash)", async ({ page }) => {
    const sink: ErrorSink = { errors: [], pageErrors: [] };
    attachLogCollector(page, sink);

    await page.goto("/#/book/no-such-tenant-zzz", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // Whatever happens, the ErrorBoundary should NOT trip. The widget
    // should either show a "practice not found" message or a generic
    // error card — both fine, neither should be an unhandled exception.
    const eb = page.getByText(/something went wrong/i);
    expect(await eb.isVisible().catch(() => false)).toBeFalsy();

    expect(sink.pageErrors, `pageerrors: ${sink.pageErrors.join("\n")}`).toHaveLength(0);
  });
});
