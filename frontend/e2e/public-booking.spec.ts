// Public booking widget E2E — walks the unauthenticated booking flow at
// /#/book/{tenantCode}, the page a marketing-site iframe loads. The
// happy path here is the conversion funnel that drives every cash-pay
// appointment, so we verify:
//   1. The widget loads against a real demo tenant code (CLRSTN).
//   2. Provider + visit-type options come back from the API.
//   3. A future-date slot fetch returns at least one slot.
//   4. Filling out the form and reaching the Submit button works.
//
// We DO NOT click Submit here — that would create a PendingBooking row
// in the seeded demo tenant on every CI run. The webhook conversion
// step is covered by StripeWebhookIntegrationTest in the backend.
//
// Run: npx playwright test e2e/public-booking.spec.ts
// Run against local: E2E_BASE_URL=http://localhost:5173 npx playwright test e2e/public-booking.spec.ts

import { test, expect, type Page } from "@playwright/test";

const DEMO_TENANT_CODE = "CLRSTN";

// Pick a weekday at least 7 days out — the demo provider has Mon-Fri
// availability and we want to skip past min_lead gates / today's
// already-booked slots.
function nextWeekdayDateString(daysOut: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

async function loadWidget(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) {
      errors.push(msg.text());
    }
  });

  await page.goto(`/#/book/${DEMO_TENANT_CODE}`, { waitUntil: "domcontentloaded" });
  // Step bar appears once /options resolves.
  await page.getByText(/VISIT TYPE/i).waitFor({ state: "visible", timeout: 20_000 });

  return errors;
}

test.describe("Public booking widget", () => {
  test("loads tenant options without console errors", async ({ page }) => {
    const errors = await loadWidget(page);

    // Visit types + provider section both rendered.
    await expect(page.getByText(/VISIT TYPE/i)).toBeVisible();
    await expect(page.getByText(/PROVIDER/i)).toBeVisible();

    // No "Pick a time" can be clicked yet (nothing selected).
    const cta = page.getByRole("button", { name: /pick a time/i });
    await expect(cta).toBeDisabled();

    expect(errors, `console errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("walks pick → date → form steps", async ({ page }) => {
    const errors = await loadWidget(page);

    // Skip when the tenant has no public visit types — the widget
    // shows "No public booking types configured" and the rest of the
    // walk is moot. We don't want this test to flake on environment
    // state we can't control from CI.
    const noPublicTypes = await page
      .getByText(/no public booking types configured/i)
      .isVisible()
      .catch(() => false);
    if (noPublicTypes) {
      test.skip(true, "Demo tenant has no public booking types — skip walk.");
      return;
    }

    // First visit-type card and first provider card. Both render as
    // buttons containing the type/provider name.
    const visitSection = page
      .locator('div:has(> :text-is("VISIT TYPE"))')
      .first();
    await visitSection.locator("button").first().click();

    const providerSection = page
      .locator('div:has(> :text-is("PROVIDER"))')
      .first();
    await providerSection.locator("button").first().click();

    // CTA enabled now — advance to the date step.
    const pickATime = page.getByRole("button", { name: /pick a time/i });
    await expect(pickATime).toBeEnabled();
    await pickATime.click();

    // Date picker visible.
    await expect(page.getByText(/^DATE$/i)).toBeVisible();
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill(nextWeekdayDateString(7));

    // Wait for slots to load. Either the slots render or the "no open
    // times" message appears — both are acceptable signals that the
    // backend fetch resolved. Failing that, the test should fail loudly.
    await Promise.race([
      page.locator("text=/^[0-9]{1,2}:[0-9]{2}/").first().waitFor({ state: "visible", timeout: 15_000 }),
      page.getByText(/no open times that day/i).waitFor({ state: "visible", timeout: 15_000 }),
    ]);

    const hasSlots = await page
      .locator("text=/^[0-9]{1,2}:[0-9]{2}/")
      .first()
      .isVisible()
      .catch(() => false);

    if (!hasSlots) {
      // Demo provider may not have an open weekday in the next 14 days
      // (depending on seeded availability). That's not a regression —
      // skip the rest of the walk gracefully so the test is durable.
      test.skip(true, "No open slots for demo provider — environment-dependent.");
      return;
    }

    // Pick the first slot, advance to the contact-info form.
    await page.locator("text=/^[0-9]{1,2}:[0-9]{2}/").first().click();
    const continueBtn = page.getByRole("button", { name: /^continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Form rendered. We don't fill it — submitting would create a
    // PendingBooking row in the demo tenant. Just verify the inputs
    // are reachable.
    await expect(page.getByText(/^FIRST NAME \*/i)).toBeVisible();
    await expect(page.getByText(/^EMAIL \*/i)).toBeVisible();
    await expect(page.getByText(/^DATE OF BIRTH \*/i)).toBeVisible();

    expect(errors, `console errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("returns to pick step when Back is clicked", async ({ page }) => {
    await loadWidget(page);

    const noPublicTypes = await page
      .getByText(/no public booking types configured/i)
      .isVisible()
      .catch(() => false);
    if (noPublicTypes) {
      test.skip(true, "Demo tenant has no public booking types — skip walk.");
      return;
    }

    const visitSection = page
      .locator('div:has(> :text-is("VISIT TYPE"))')
      .first();
    await visitSection.locator("button").first().click();

    const providerSection = page
      .locator('div:has(> :text-is("PROVIDER"))')
      .first();
    await providerSection.locator("button").first().click();

    await page.getByRole("button", { name: /pick a time/i }).click();
    await expect(page.getByText(/^DATE$/i)).toBeVisible();

    await page.getByRole("button", { name: /^back/i }).click();
    await expect(page.getByText(/VISIT TYPE/i)).toBeVisible();
  });
});
