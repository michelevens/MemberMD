# Widget integration test sites

Three demo marketing sites that embed all four MemberMD public widgets
(enrollment, plan comparison, booking, signature) for three different
practice tenants. Used to validate white-label theming, plan list
rendering, Stripe wiring, and cross-origin iframe behavior end to end.

## URLs (after deploy)

- Index: https://app.membermd.io/widget-demo/
- Site A: https://app.membermd.io/widget-demo/site-a/
- Site B: https://app.membermd.io/widget-demo/site-b/
- Site C: https://app.membermd.io/widget-demo/site-c/

The same files are also in this repo at `frontend/public/widget-demo/`
so you can drop them onto any other static host (Netlify, Vercel,
S3+CloudFront) for cross-host validation.

## One-time setup

The three demo practices live in production. Seed them with:

```bash
# On Railway (or local pointed at production DB):
php artisan widgets:seed-test-practices --source="EnnHealth Psychiatry"
```

This clones EnnHealth Psychiatry's plans + entitlements into three
sibling practices (`widget-demo-site-a`, `-site-b`, `-site-c`),
auto-generates a `tenant_code` for each, and creates a
`SignatureRequest` per site so the signature widget has a real token
to mount.

The command prints a JSON block at the end. **Paste that into the
`sites` array of `config.json`**, replacing the `PASTE_FROM_SEED_RUN`
placeholders. Commit and push — the next GH Pages deploy picks up
the new tenant codes.

The seeder is idempotent: re-running deletes the prior demo practices
(matched by slug prefix `widget-demo-`) before recreating, so you can
rotate tokens / refresh data without leaving stale rows.

## Local dev

Open the site files directly via the Vite dev server:

```bash
cd frontend && npm run dev
# then visit http://localhost:5173/widget-demo/
```

Or rebuild the three site folders after editing `_site-template.html`:

```bash
cd frontend && npm run build:widget-demo
```

## Architecture

- `_site-template.html` is the shared marketing-site mockup. One source.
- `build-sites.mjs` reads it + `config.json` and emits `site-a/`, `-b/`,
  `-c/` each containing an `index.html` with `WIDGET_DEMO_SITE_INDEX`
  set to its slot.
- `npm run build` invokes `build-sites.mjs` before Vite, so the three
  sites stay in sync with whatever's in the template + config.
- Vite copies the whole `public/` tree to `dist/`, so GH Pages serves
  the demo sites alongside the main app.

## Adding a fourth site

1. Add an entry to `config.json`'s `sites` array.
2. Re-run `npm run build:widget-demo` (or just `npm run build`).
3. Run the seed command with `--source="..."` again. (The seeder
   currently hard-codes 3 variants in `DEMO_VARIANTS` — extend that
   array to match `config.json`.)

## Tearing down

Re-run the seed command without arguments and it errors out cleanly.
Or run a one-liner against production:

```sql
DELETE FROM practices WHERE slug LIKE 'widget-demo-%';
```

(Cascades to plans, entitlements, signature requests via FK.)
