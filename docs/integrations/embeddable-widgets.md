# Branded Embeddable Widgets

> **Status:** Shipped — Q2 2026
> **Owner:** Platform / White-label
> **Related:** ROADMAP.md § Phase 1.6, ADR-0004 (generic white-label)

This document covers the white-label widget stack: custom domain claim + TXT verification, CSS theming, embed snippets, and conversion analytics.

## What's optional vs. always-on

Every Practice has a working enrollment URL on the platform from the moment they sign up — no setup required:

```
https://app.membermd.io/#/enroll/{tenant_code}
https://app.membermd.io/#/plans/{tenant_code}
```

White-label is **strictly additive** on top of these defaults:

- Themes work on the default URL — no custom domain required.
- Custom domains are optional; default URLs always continue to work.
- Practices that never touch the Branded Widgets settings have the same experience as before.

## Custom domains

### Add + verify

1. Practice admin enters a hostname (e.g., `enroll.acmedpc.com`) in **Settings → Branded Widgets → Custom Domains**.
2. We persist the row + generate a 32-char random verification token.
3. We instruct them to add a TXT record:
   - **Host:** `_membermd.<their-domain>`
   - **Value:** `membermd-verify=<token>`
4. They add the record at their DNS provider (~5 min job at GoDaddy/Cloudflare/Namecheap).
5. They click **Verify** — backend does `dns_get_record($host, DNS_TXT)` and matches the token.

Once verified:
- The domain is routable (the platform's reverse proxy / Railway / Cloudflare needs to be configured to accept the host — see "DNS / SSL plumbing" below).
- The Embed Code panel uses the verified domain in generated snippets.
- The "primary" domain (settable per tenant) is the canonical URL used in embed snippets.

### Why TXT verification

Without ownership proof, anyone could claim any hostname and intercept enrollment traffic. TXT-based verification is the industry-standard pattern (Vercel, Stripe Connect, Netlify, Google Workspace, Cloudflare).

### Domain release

A practice can release a domain at any time. The row is hard-deleted; the TXT record can stay or go (we don't care once unlinked).

### Multi-tenant uniqueness

A given hostname can only be claimed by one practice on the platform. Attempting to claim a hostname that another tenant already has → 409. Practices that change ownership of a domain must release it from the old practice first.

### DNS / SSL plumbing (out of scope for v1)

The application code is ready, but actually serving traffic at `enroll.acmedpc.com` requires:
- A DNS CNAME from the operator pointing to your platform (e.g., `cname.membermd.io`).
- An SSL certificate for the custom hostname (Let's Encrypt via Caddy/Cloudflare/Railway add-on).
- A reverse proxy that forwards `Host: enroll.acmedpc.com` requests to the SPA.

These are infrastructure concerns. The verified-domain row in `tenant_domains` is the source of truth the proxy reads.

## Themes

Each tenant can save a **WidgetTheme** per scope:
- `all` — applied to every widget surface unless scope-specific theme exists
- `enrollment`, `plans`, `booking` — scope-specific overrides

A theme is two things stacked:

### CSS variables (always safe)

A flat key → string map of CSS custom properties applied as `:root` declarations. Only keys in `WidgetTheme::ALLOWED_VARIABLES` are accepted; everything else is silently dropped.

| Variable | Purpose |
|---|---|
| `primary` / `primary_hover` | Brand primary (CTAs) |
| `secondary` / `accent` | Secondary accents |
| `text` / `text_muted` | Body + muted text |
| `background` / `surface` / `border` | Layout backgrounds |
| `success` / `warning` / `error` | Status colors |
| `radius_sm` / `radius_md` / `radius_lg` | Border radii |
| `spacing_unit` | Optional spacing scale |

Frontend reads these as `--mm-primary`, `--mm-radius-md`, etc. The hook `useWidgetTheme(tenantCode, scope)` injects them on the document root.

### Custom CSS (escape hatch, sanitized)

Operators who want more control can paste arbitrary CSS into a `custom_css` field. Server-side, we strip:
- `@import` rules
- `expression(...)` (IE-era XSS vector)
- `javascript:` and `behavior:` declarations
- `-moz-binding:`
- `url(...)` references to off-host resources (only `data:image/`, `/path/`, and `#fragment` URLs are kept)

The sanitized result is what's stored and what's served back. Tests in `BrandedWidgetsTest::test_custom_css_strips_dangerous_patterns` lock in the behavior.

### Default fallback

Tenants with no theme row get `WidgetTheme::defaults()` — the platform's standard teal/navy palette. The frontend always has a renderable theme to work with.

## Embed snippets

The Embed Code panel generates three things:

1. **Iframe enrollment widget**
   ```html
   <iframe src="https://enroll.acmedpc.com" width="100%" height="780" frameborder="0" style="border-radius:20px;"></iframe>
   ```
2. **Iframe plan comparison**
   ```html
   <iframe src="https://enroll.acmedpc.com/plans" width="100%" height="640" frameborder="0" style="border-radius:20px;"></iframe>
   ```
3. **Direct link**
   ```html
   <a href="https://enroll.acmedpc.com">Enroll now</a>
   ```

If no verified domain is set, snippets fall back to the default platform URL.

Why iframe-only for embeds: isolated styling, no host-page CSS conflicts, and CSP-friendly. A script-tag mode (which injects HTML directly into the host page) is roadmapped but adds CSP complexity that's not worth it for v1.

## Analytics

Every widget mount fires an `impression` event. The enrollment flow additionally fires `start` (when the user advances past step 0) and `complete` (on successful submission).

### Wire format
```
POST /api/public/widget/events
{
  "tenant_code": "ABC123",
  "widget_type": "enrollment" | "plans" | "booking",
  "event_type":  "impression" | "start" | "complete" | "error",
  "session_id":  "s_xyz",       // optional, groups events from one visitor
  "utm_source":  "...",          // optional
  "utm_medium":  "...",
  "utm_campaign":"...",
  "metadata":    { ... }        // optional, arbitrary
}
```

The endpoint:
- Resolves `tenant_code` to a Practice. Unknown → 204 (silent).
- Hashes the IP per-day per-tenant for deduplication without storing raw PII.
- Records to `widget_events` table.
- Returns 202 (accepted, fire-and-forget).

### Summary
```
GET /api/widget-analytics/summary?days=30&widget_type=enrollment
```

Returns per-widget-type funnel:
- `impressions`
- `starts`
- `completes`
- `errors`
- `start_rate` = starts / impressions
- `conversion_rate` = completes / starts
- `overall_rate` = completes / impressions

Tenant-scoped automatically (via `BelongsToTenant` on `WidgetEvent`).

### What we deliberately don't track
- Per-widget breakdown (multiple enrollment widgets on different pages)
- Per-source attribution beyond UTM passthrough
- Funnel time-to-convert
- A/B test variants

These all become valuable around customer 25+ and are roadmapped.

## Files

| Concern | File |
|---|---|
| Domain verification logic | `app/Services/DomainVerificationService.php` |
| Domain CRUD endpoints | `app/Http/Controllers/Api/TenantDomainController.php` |
| Theme CRUD + sanitization | `app/Http/Controllers/Api/WidgetThemeController.php` |
| Event ingest + summary | `app/Http/Controllers/Api/WidgetAnalyticsController.php` |
| Public theme + domain resolve | `app/Http/Controllers/Api/PublicWidgetController.php` |
| Models | `app/Models/{TenantDomain,WidgetTheme,WidgetEvent}.php` |
| Frontend settings UI | `frontend/src/components/settings/BrandedWidgets.tsx` |
| Theme apply hook | `frontend/src/hooks/useWidgetTheme.ts` |
| Tests | `tests/Feature/BrandedWidgetsTest.php` |

## Operations runbook

### "Practice says verify keeps failing"
1. Check the TXT record from outside our infra: `dig TXT _membermd.<their-domain> +short` or `nslookup -type=TXT _membermd.<their-domain>`.
2. DNS propagation can take up to 48 hours but usually completes in 5–15 min. Tell them to wait and retry.
3. Some DNS providers automatically wrap TXT values in quotes. Our matcher uses `str_contains`, so wrapped quotes are fine — but check that the value matches exactly otherwise.
4. If `_membermd` subdomain isn't allowed by their provider (rare), fall back to manual verification (set `verified_at` and `verification_method = 'manual'` directly).

### "Theme isn't applying"
1. Check `widget_themes` for a row with that tenant_id + scope.
2. Hit `GET /api/public/widget/{tenantCode}/theme?scope=enrollment` and verify the response.
3. Browser DevTools → check for `<style id="membermd-widget-theme">` in `<head>`.
4. Hard-refresh — service workers can cache the theme response.

### "Custom CSS shows up empty"
The sanitizer stripped it. Check what was stored — most likely `@import`, off-host `url()`, or `expression()`. Tell the practice to use only `data:` URLs or paths that start with `/` for assets.

## Future work (post-v1)

- **SSL automation** — Caddy or Cloudflare for Origins integration so verified domains automatically get SSL with no infrastructure work.
- **Operator-level templates** — operator defines a default theme; new tenants inherit; tenants override via the existing per-tenant theme.
- **Per-widget analytics** — multiple enrollment widgets with separate IDs.
- **A/B testing framework** — variant assignment + tracking.
- **Script-tag embed mode** — inject HTML inline with proper CSP guidance.
- **Widget preview at the actual custom domain** — currently the preview is a sample card; real-domain preview requires the SSL plumbing above.
