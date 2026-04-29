# MemberMD Frontend

React 18 + TypeScript + Vite + Tailwind v4 + shadcn/ui. Powers the
patient portal, practice portal, super-admin portal, and the
embeddable widgets.

## Setup

```bash
npm install
cp .env.example .env  # set VITE_API_URL=http://localhost:8000
npm run dev  # http://localhost:5173
```

## Scripts

```bash
npm run dev     # Vite dev server with HMR
npm run build   # Type-check + production build to dist/
npm test        # Vitest unit tests
npm run preview # Serve the built dist/ locally
```

**The build must pass with zero errors before any commit.** This is a
hard rule (see [CLAUDE.md](../CLAUDE.md)).

## Architecture

- `src/components/portals/` — top-level portals: SuperAdminPortal,
  PracticePortal, PatientPortal, EmployerPortal.
- `src/components/widgets/` — embeddable widgets (PlanWidget,
  EnrollmentWidget, AppointmentBookingWidget) shipped as standalone
  bundles for clinic websites.
- `src/components/ui/` — shadcn/ui primitives.
- `src/lib/api.ts` — typed API client. Single source of truth for
  HTTP calls. Includes `isUsingMockData()` for demo-mode toggling.
- `src/lib/auth.ts` — Sanctum token storage + login/logout flow.
- `src/hooks/` — shared React hooks.

## Routing

We use **HashRouter**, not BrowserRouter. This is intentional — the
frontend is hosted on GitHub Pages without server-side rewrites, so
hash routing is the simplest path to deep links that survive a
reload. Don't switch to BrowserRouter without coordinating
infrastructure changes.

## Styling rules

- **No arbitrary Tailwind values.** No `bg-[#hex]` or `text-[11px]`.
  If you need a one-off value, use `style={{}}`.
- shadcn/ui components are in `src/components/ui/` and should NOT be
  modified directly — re-export with a project-specific wrapper if
  you need to customize.
- Tailwind v4 uses CSS-based config. Global tokens live in
  `src/styles/`.

## Demo mode

`isUsingMockData()` (in `src/lib/api.ts`) controls whether the app
renders demo PHI for unauthenticated or local-dev visitors. In
production, demo mode is OFF and authenticated users see real data
only — never the demo records.

## Building widgets

Embeddable widgets are bundled separately so customers can drop them
into their own websites without our full app. Build outputs go to
`dist/widgets/`. Each widget is a single `.js` file.

## Deployment

Production runs on GitHub Pages at `app.membermd.io`. The deploy
workflow (`.github/workflows/...`) builds `main` on push and
publishes to `gh-pages`.

`VITE_API_URL` is set as a GitHub repo secret to point at the
Railway backend.
