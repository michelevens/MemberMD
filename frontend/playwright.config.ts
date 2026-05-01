// Playwright config for the MemberMD smoke suite.
//
// Points at the live production app by default — that's what real users
// hit, and the demo accounts seeded by DemoSeeder are addressable there.
// Override with E2E_BASE_URL=http://localhost:5173 to run against a
// local dev server (you'll need the Laravel backend running too).
//
// The suite is intentionally smoke-only: load each portal, click every
// primary nav item, fail on uncaught exceptions or ErrorBoundary trips.
// It is NOT a functional test of every CRUD action — that's tier 2.

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "https://app.membermd.io";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // sequential — production app, no parallel hammering
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
    // App is on GitHub Pages with HashRouter so we don't need any special
    // routing config — the SPA handles it via the hash fragment.
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
