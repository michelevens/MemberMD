# Widget demo site rebrand

Tool that clones [michelevens/ennhealth-psychiatry](https://github.com/michelevens/ennhealth-psychiatry)
and rebrands it into a demo MemberMD widget-test marketing site, then
pushes to a destination GH Pages repo.

The point: each demo site looks like a real practice (full marketing
chrome, services grid, FAQ, testimonials, footer) — not a tech demo
mockup. The MemberMD enrollment / plan-comparison / booking /
signature widgets get embedded as iframes in the pricing + booking
sections, so we can validate widget integration end to end on a
realistic host.

## Sites currently in service

| Slug | Repo | Live URL |
|---|---|---|
| `aurora-psychiatry` | [github.com/michelevens/aurora-psychiatry](https://github.com/michelevens/aurora-psychiatry) | https://michelevens.github.io/aurora-psychiatry/ |
| `cedar-mind-wellness` | [github.com/michelevens/cedar-mind-wellness](https://github.com/michelevens/cedar-mind-wellness) | https://michelevens.github.io/cedar-mind-wellness/ |
| `lumen-psychiatry-group` | [github.com/michelevens/lumen-psychiatry-group](https://github.com/michelevens/lumen-psychiatry-group) | https://michelevens.github.io/lumen-psychiatry-group/ |

## How it works

`rebrand.sh` is driven entirely by env vars:

```bash
SLUG=aurora-psychiatry \
NAME="Aurora Psychiatry" \
ACCENT="#5B4CB8" \
ACCENT_DARK="#3D2F87" \
ACCENT_LIGHT="#8B7BD6" \
PHONE="(303) 555-0142" \
PHONE_TEL="3035550142" \
EMAIL="hello@aurorapsychiatry.example" \
ADDRESS_CITY="Denver, CO" \
PROVIDER_NAME="Dr. Aria Reyes, DNP, PMHNP" \
TAGLINE_HERO="Care that fits your life" \
./rebrand.sh
```

Optional widget-target env vars (default to `PASTE_TENANT_CODE`/`PASTE_SIGNATURE_TOKEN` placeholders):

```bash
TENANT_CODE="ABC123" SIGNATURE_TOKEN="xyz" ./rebrand.sh
```

What it does:

1. Clones `michelevens/ennhealth-psychiatry` into `/c/temp/ennhealth-psychiatry` if not present.
2. Wipes `/c/temp/widget-demo-repos/$SLUG/` and copies the template fresh, preserving any prior `.git` directory.
3. Runs literal-string substitutions across every `.html`/`.css` for brand name, provider, phone, email, city, color hex codes.
4. Surgically replaces the `<section id="pricing">` block with a MemberMD plan-comparison + enrollment iframe.
5. Surgically replaces the `<section id="book">` block with a MemberMD booking iframe + appends new sections for enrollment + signature widgets.
6. Drops `sitemap.xml`, `robots.txt`, `CNAME`, `build-sitemap.sh` (live-site SEO files we don't want on the demo).
7. Writes a per-repo `README.md` explaining the demo.
8. Inits git, commits, pushes to `https://github.com/michelevens/$SLUG`.

## Connecting widgets to real practice tenants

The three demo sites currently embed widgets pointing at `PASTE_TENANT_CODE` placeholders. To wire them to real tenants:

1. Run on production:
   ```bash
   php artisan widgets:seed-test-practices --source="EnnHealth Psychiatry"
   ```
2. The command outputs JSON with `tenant_code` + `signature_token` per slug.
3. Re-run `rebrand.sh` for each slug with `TENANT_CODE=...` `SIGNATURE_TOKEN=...` set.

## Adding a new demo site

1. `gh repo create michelevens/<slug> --public --description "..."`
2. Run `rebrand.sh` with the new slug.
3. Enable Pages: `gh api -X POST "repos/michelevens/<slug>/pages" -f "source[branch]=main" -f "source[path]=/"`

## Tear-down

```bash
gh repo delete michelevens/<slug> --yes
```

Plus on production:
```sql
DELETE FROM practices WHERE slug = 'widget-demo-<slug>';
```
