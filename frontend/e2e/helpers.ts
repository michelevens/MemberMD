// Shared E2E helpers.
//
// All prod-pointing read-only walks share these primitives:
//   - login as a demo role (no typing creds)
//   - capture console + page errors with framework-noise filtering
//   - assert ErrorBoundary fallback isn't visible
//   - walk a sidebar nav, attribute errors to the tab they happened in
//
// The smoke.spec.ts file inlines its own copies (older); new specs
// pull from here so we're not maintaining two divergent copies of the
// same code.

import { expect, type Page, type ConsoleMessage } from "@playwright/test";

export type Role = "Superadmin" | "Practice Admin" | "Provider" | "Staff" | "Patient";

export interface RunFailure {
  area: string;
  tab: string;
  kind: "console_error" | "page_error" | "error_boundary" | "nav_missing" | "missing_assertion";
  message: string;
}

export interface ErrorSink {
  errors: string[];
  pageErrors: string[];
}

// Console messages that aren't real bugs — favicon misses, ad-blocker
// false positives, CSP test-iframes. Anything else gets recorded.
const NOISE = [
  "Failed to load resource",
  "favicon.ico",
  "Refused to load",
  "net::ERR_BLOCKED_BY_CLIENT",
  "net::ERR_FAILED",
  // React DevTools in production shows a "Download the React DevTools"
  // hint as console.info at startup — sometimes routed through error
  // depending on the browser console mapping. Not actionable.
  "Download the React DevTools",
];

export function attachLogCollector(page: Page, sink: ErrorSink) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (NOISE.some((n) => text.includes(n))) return;
    sink.errors.push(text);
  });
  page.on("pageerror", (err) => {
    sink.pageErrors.push(err.message);
  });
}

export async function loginAsDemo(page: Page, role: Role) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.goto("/#/login", { waitUntil: "domcontentloaded" });

  // The demo picker is collapsed by default. The "Try a demo account"
  // toggle text exists outside the picker, then a button per role.
  const picker = page.getByText("Try a demo account");
  await picker.waitFor({ state: "visible", timeout: 15_000 });
  await picker.click();

  await page.getByRole("button", { name: new RegExp(`^${role}\\b`) }).click();
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

export async function logout(page: Page) {
  // PortalShell user menu varies across portals; the most reliable
  // path is to clear storage + reload. Real users hit a logout button,
  // but for tests we just need the auth state cleared.
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/#/login", { waitUntil: "domcontentloaded" });
}

/**
 * Click a sidebar nav row by its label text. PortalShell rows are
 * sometimes <button>, sometimes <a>, sometimes a div with role=button.
 * Try each in order. For long sidebars (Practice Admin), scroll the
 * label into view first.
 */
export async function clickNav(page: Page, label: string): Promise<boolean> {
  const candidates = [
    page.getByRole("button", { name: label, exact: false }),
    page.getByRole("link", { name: label, exact: false }),
    page.getByText(label, { exact: true }),
  ];

  for (const loc of candidates) {
    try {
      const target = loc.first();
      // Scroll the row into view first — Practice Admin sidebar has
      // ~30 items and bottom rows are off-screen by default.
      await target.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
      await target.click({ timeout: 4_000 });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Walk a list of nav labels, recording failures per tab.
 * Returns the failures so the caller can assert on them.
 */
export async function walkNav(
  page: Page,
  area: string,
  navLabels: string[],
  sink: ErrorSink,
): Promise<RunFailure[]> {
  const failures: RunFailure[] = [];

  for (const label of navLabels) {
    const beforeErrors = sink.errors.length;
    const beforePageErrors = sink.pageErrors.length;

    const clicked = await clickNav(page, label);
    if (!clicked) {
      failures.push({ area, tab: label, kind: "nav_missing", message: "could not find clickable nav item" });
      continue;
    }

    // Brief settle — async data fetches + ErrorBoundary catches fire here.
    await page.waitForTimeout(900);

    const eb = page.getByText(/something went wrong|the application encountered an error/i);
    if (await eb.isVisible().catch(() => false)) {
      failures.push({ area, tab: label, kind: "error_boundary", message: "ErrorBoundary fallback rendered" });
    }

    for (const m of sink.errors.slice(beforeErrors)) {
      failures.push({ area, tab: label, kind: "console_error", message: m.slice(0, 280) });
    }
    for (const m of sink.pageErrors.slice(beforePageErrors)) {
      failures.push({ area, tab: label, kind: "page_error", message: m.slice(0, 280) });
    }
  }

  return failures;
}

/**
 * Standard end-of-test assertion. Page errors and ErrorBoundary trips
 * are hard fails; console errors and nav-missing are reported in the
 * test output but don't block — they're often environment-dependent
 * (a tab may not have content seeded for the demo tenant).
 */
export function assertNoHardFailures(failures: RunFailure[]) {
  const hard = failures.filter((f) => f.kind === "page_error" || f.kind === "error_boundary");
  if (hard.length > 0) {
    const summary = hard
      .map((f) => `  ${f.area}/${f.tab} [${f.kind}]: ${f.message}`)
      .join("\n");
    expect(hard, `Hard E2E failures:\n${summary}`).toHaveLength(0);
  }
}
