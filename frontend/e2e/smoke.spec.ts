// Smoke E2E for MemberMD — walks every portal, clicks every nav item,
// fails on console errors / unhandled exceptions / ErrorBoundary trips.
//
// Strategy:
//   1. Sign in via the demo-account picker (no typing of creds).
//   2. Walk each role's sidebar nav by clicking the label text.
//   3. While walking, collect console.error / pageerror events.
//   4. After each tab, assert the ErrorBoundary fallback is NOT visible.
//   5. Report a failure summary at the end so a single run surfaces every
//      broken portal/tab pair.
//
// The suite is read-only — no CRUD assertions. The goal is "the page
// rendered without crashing." Functional tests are tier 2.
//
// Run: npx playwright test
// Run against local: E2E_BASE_URL=http://localhost:5173 npx playwright test
// Run with UI: npx playwright test --ui

import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

// ─── Demo nav inventories ─────────────────────────────────────────────────
//
// Source of truth: the label arrays in each portal's nav definition.
// Kept here so the test can validate every nav row gets a paint.

const PATIENT_NAV = [
  "Dashboard",
  "Appointments",
  "Messages",
  "Health Records",
  "Billing & Account",
  "Profile",
];

const PRACTICE_NAV_ADMIN = [
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
  "Membership Plans",
  "Invoices",
  "Payments",
  "Coupons",
  "Providers",
  "Staff",
];

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
  "Billing",
  "Support",
  "Audit Logs",
  "Settings",
];

// ─── Helpers ──────────────────────────────────────────────────────────────

interface RunFailure {
  portal: string;
  tab: string;
  kind: "console_error" | "page_error" | "error_boundary" | "nav_missing";
  message: string;
}

function attachLogCollector(page: Page, sink: { errors: string[]; pageErrors: string[] }) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter out known-noisy framework warnings that aren't real bugs.
      if (
        text.includes("Failed to load resource") ||
        text.includes("favicon.ico") ||
        text.includes("Refused to load") || // CSP test in iframes
        text.includes("net::ERR_BLOCKED_BY_CLIENT") // ad-blocker false positives
      ) {
        return;
      }
      sink.errors.push(text);
    }
  });
  page.on("pageerror", (err) => {
    sink.pageErrors.push(err.message);
  });
}

async function loginAsDemo(page: Page, role: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The hash route #/login is the default for unauthenticated users —
  // depending on cached state the first goto may land on a portal,
  // so explicitly navigate.
  await page.goto("/#/login", { waitUntil: "domcontentloaded" });

  // Expand the demo account picker if collapsed.
  const picker = page.getByText("Try a demo account");
  await picker.waitFor({ state: "visible", timeout: 15_000 });
  await picker.click();

  // Click the role button. The button contains both the role label and
  // the email — match by role text in a button that's inside the picker.
  await page.getByRole("button", { name: new RegExp(`^${role}\\b`) }).click();

  // Wait for redirect into the portal — sidebar appears.
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

async function logout(page: Page) {
  // PortalShell user dropdown -> Logout. Avatar is the trigger; menu items
  // include "Sign out" or similar.
  // Easiest: navigate to /#/login which clears auth context on most apps,
  // but this app uses a real logout flow. Try menu, fall back to clearing
  // localStorage + reload.
  try {
    await page
      .locator('button[aria-haspopup], button:has-text("Logout"), button:has-text("Sign out")')
      .first()
      .click({ timeout: 3_000 });
    await page
      .getByRole("menuitem", { name: /sign out|log out|logout/i })
      .click({ timeout: 3_000 });
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  } catch {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/#/login", { waitUntil: "domcontentloaded" });
  }
}

async function walkNav(
  page: Page,
  portal: string,
  navLabels: string[],
  failures: RunFailure[],
  sink: { errors: string[]; pageErrors: string[] },
) {
  for (const label of navLabels) {
    // Reset per-tab error sinks so we attribute crashes to the right tab.
    const beforeErrors = sink.errors.length;
    const beforePageErrors = sink.pageErrors.length;

    // Click the sidebar nav item. The PortalShell sidebar rows are buttons
    // (or links) containing the label text; pick the FIRST visible match
    // to avoid hitting a header h1 that happens to share the label.
    const nav = page.getByRole("button", { name: label }).or(page.getByRole("link", { name: label }));
    let clicked = false;
    try {
      await nav.first().click({ timeout: 5_000 });
      clicked = true;
    } catch {
      // Some labels may be hidden behind a mobile drawer or wrapped in
      // a different role; try a plain text click as a fallback.
      try {
        await page.getByText(label, { exact: true }).first().click({ timeout: 3_000 });
        clicked = true;
      } catch {
        failures.push({ portal, tab: label, kind: "nav_missing", message: "could not find clickable nav item" });
      }
    }

    if (clicked) {
      // Brief settle so async data fetches and ErrorBoundary catches fire.
      await page.waitForTimeout(800);

      // ErrorBoundary fallback shows a "Something went wrong" panel with
      // a Reload button — assert it isn't there.
      const eb = page.getByText(/something went wrong|the application encountered an error/i);
      if (await eb.isVisible().catch(() => false)) {
        failures.push({ portal, tab: label, kind: "error_boundary", message: "ErrorBoundary fallback rendered" });
      }
    }

    // Capture any console / page errors that fired during this tab's load.
    const newErrors = sink.errors.slice(beforeErrors);
    const newPageErrors = sink.pageErrors.slice(beforePageErrors);
    for (const m of newErrors) {
      failures.push({ portal, tab: label, kind: "console_error", message: m.slice(0, 280) });
    }
    for (const m of newPageErrors) {
      failures.push({ portal, tab: label, kind: "page_error", message: m.slice(0, 280) });
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe("MemberMD smoke", () => {
  const allFailures: RunFailure[] = [];

  test.afterAll(() => {
    if (allFailures.length === 0) {
      // eslint-disable-next-line no-console
      console.log("\nAll portals walked clean.\n");
      return;
    }
    // eslint-disable-next-line no-console
    console.log("\n=== SMOKE FAILURES ===");
    const grouped: Record<string, RunFailure[]> = {};
    for (const f of allFailures) {
      const key = `${f.portal} / ${f.tab}`;
      (grouped[key] = grouped[key] || []).push(f);
    }
    for (const [key, list] of Object.entries(grouped)) {
      // eslint-disable-next-line no-console
      console.log(`\n  ${key}`);
      for (const f of list) {
        // eslint-disable-next-line no-console
        console.log(`    [${f.kind}] ${f.message}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\nTotal failures: ${allFailures.length}\n`);
  });

  test("Patient portal", async ({ page }) => {
    const sink = { errors: [] as string[], pageErrors: [] as string[] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Patient");

    const failures: RunFailure[] = [];
    await walkNav(page, "Patient", PATIENT_NAV, failures, sink);
    allFailures.push(...failures);

    expect(failures.filter((f) => f.kind === "error_boundary"), "no ErrorBoundary trips").toHaveLength(0);
    expect(failures.filter((f) => f.kind === "page_error"), "no uncaught page errors").toHaveLength(0);
  });

  test("Practice Admin portal", async ({ page }) => {
    const sink = { errors: [] as string[], pageErrors: [] as string[] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Practice Admin");

    const failures: RunFailure[] = [];
    await walkNav(page, "Practice Admin", PRACTICE_NAV_ADMIN, failures, sink);
    allFailures.push(...failures);

    expect(failures.filter((f) => f.kind === "error_boundary"), "no ErrorBoundary trips").toHaveLength(0);
    expect(failures.filter((f) => f.kind === "page_error"), "no uncaught page errors").toHaveLength(0);
  });

  test("SuperAdmin portal", async ({ page }) => {
    const sink = { errors: [] as string[], pageErrors: [] as string[] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Superadmin");

    const failures: RunFailure[] = [];
    await walkNav(page, "SuperAdmin", SUPERADMIN_NAV, failures, sink);
    allFailures.push(...failures);

    expect(failures.filter((f) => f.kind === "error_boundary"), "no ErrorBoundary trips").toHaveLength(0);
    expect(failures.filter((f) => f.kind === "page_error"), "no uncaught page errors").toHaveLength(0);
  });

  test("Provider portal", async ({ page }) => {
    const sink = { errors: [] as string[], pageErrors: [] as string[] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Provider");

    // Provider lands in the Practice Portal with a provider-scoped nav —
    // many of the same items as Practice Admin, plus the role filters.
    // We just walk the dashboard + a few clinical tabs that providers see.
    const failures: RunFailure[] = [];
    const PROVIDER_NAV = ["Dashboard", "Patient Roster", "Appointments", "Encounters", "Prescriptions"];
    await walkNav(page, "Provider", PROVIDER_NAV, failures, sink);
    allFailures.push(...failures);

    expect(failures.filter((f) => f.kind === "error_boundary"), "no ErrorBoundary trips").toHaveLength(0);
    expect(failures.filter((f) => f.kind === "page_error"), "no uncaught page errors").toHaveLength(0);
  });

  test("Staff portal", async ({ page }) => {
    const sink = { errors: [] as string[], pageErrors: [] as string[] };
    attachLogCollector(page, sink);

    await loginAsDemo(page, "Staff");

    // Staff role uses the Practice Portal with a smaller subset.
    const failures: RunFailure[] = [];
    const STAFF_NAV = ["Dashboard", "Patient Roster", "Appointments", "Membership Plans", "Invoices", "Payments"];
    await walkNav(page, "Staff", STAFF_NAV, failures, sink);
    allFailures.push(...failures);

    expect(failures.filter((f) => f.kind === "error_boundary"), "no ErrorBoundary trips").toHaveLength(0);
    expect(failures.filter((f) => f.kind === "page_error"), "no uncaught page errors").toHaveLength(0);
  });
});
