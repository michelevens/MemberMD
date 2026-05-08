#!/bin/bash
set -euo pipefail

# Rebrand the ennhealth-psychiatry repo into a demo MemberMD widget-test
# site, then push to the destination GH repo. Driven by ENV vars so we
# can run it once per demo:
#
#   SLUG=aurora-psychiatry \
#   NAME="Aurora Psychiatry" \
#   ACCENT="#5B4CB8" \
#   ACCENT_DARK="#3D2F87" \
#   ACCENT_LIGHT="#8B7BD6" \
#   PHONE="(555) 102-7700" \
#   PHONE_TEL="5551027700" \
#   EMAIL="hello@aurorapsychiatry.example" \
#   ADDRESS_CITY="Denver, CO" \
#   PROVIDER_NAME="Dr. Aria Reyes, DNP, PMHNP" \
#   TAGLINE_HERO="Care that fits your life" \
#   ./rebrand.sh
#
# Then to wire MemberMD widgets:
#   TENANT_CODE="ABC123" SIGNATURE_TOKEN="xyz" ./rebrand.sh
# (Re-running is safe; it always rebuilds from the template clone.)

: "${SLUG:?required}"
: "${NAME:?required}"
: "${ACCENT:?required}"
: "${ACCENT_DARK:?required}"
: "${ACCENT_LIGHT:?required}"
: "${PHONE:?required}"
: "${PHONE_TEL:?required}"
: "${EMAIL:?required}"
: "${ADDRESS_CITY:?required}"
: "${PROVIDER_NAME:?required}"
: "${TAGLINE_HERO:?required}"

TENANT_CODE="${TENANT_CODE:-PASTE_TENANT_CODE}"
SIGNATURE_TOKEN="${SIGNATURE_TOKEN:-PASTE_SIGNATURE_TOKEN}"
PLATFORM="https://app.membermd.io"

TEMPLATE_DIR="/c/temp/ennhealth-psychiatry"
WORK_DIR="/c/temp/widget-demo-repos/$SLUG"

echo "=== Rebranding to $NAME ($SLUG) ==="

# Wipe and recopy the entire ennhealth structure as the starting point.
# Keep .git from any prior push so we don't have to enable Pages again.
GIT_BACKUP=""
if [[ -d "$WORK_DIR/.git" ]]; then
  GIT_BACKUP="/c/temp/widget-demo-repos/.gitbak-$SLUG"
  rm -rf "$GIT_BACKUP"
  mv "$WORK_DIR/.git" "$GIT_BACKUP"
fi
rm -rf "$WORK_DIR"
cp -r "$TEMPLATE_DIR" "$WORK_DIR"
rm -rf "$WORK_DIR/.git" "$WORK_DIR/.github"
if [[ -n "$GIT_BACKUP" ]]; then
  mv "$GIT_BACKUP" "$WORK_DIR/.git"
fi

cd "$WORK_DIR"

# 1) Brand-string substitutions across the whole site.
# Run on .html and .css files so SEO/Schema.org/CSS variables all flip.
declare -a TARGETS=(
  "EnnHealth Psychiatry|$NAME"
  "EnnHealth LLC|$NAME LLC"
  "EnnHealth|${NAME%% *}"
  "ennhealth.com|${SLUG}.example"
  "contact@ennhealth.com|$EMAIL"
  "+1-866-796-9995|+1-${PHONE_TEL}"
  "(866) 796-9995|$PHONE"
  "8667969995|$PHONE_TEL"
  "Dr. Nageley Michel, DNP, PMHNP, FNP|$PROVIDER_NAME"
  "Dr. Nageley Michel|${PROVIDER_NAME%%,*}"
  "Nageley Michel|${PROVIDER_NAME#Dr. }"
  "Dr. Nageley|${PROVIDER_NAME%%,*}"
  "Nageley|${PROVIDER_NAME%%,*}"
  "Clermont, Florida|$ADDRESS_CITY"
  "Clermont, FL|$ADDRESS_CITY"
  "Clermont|${ADDRESS_CITY%%,*}"
  "Central Florida — Orlando, Denver, Kissimmee, Sanford, Daytona Beach, Lakeland & surrounding areas|${ADDRESS_CITY} & surrounding areas"
  "Central Florida|the ${ADDRESS_CITY} area"
  'geo.region" content="US-FL"|geo.region" content="US-'"${ADDRESS_CITY##*, }"'"'
)

shopt -s globstar nullglob
for f in **/*.html **/*.css; do
  [[ -f "$f" ]] || continue
  for pair in "${TARGETS[@]}"; do
    needle="${pair%%|*}"
    replacement="${pair##*|}"
    # Use python for safe literal substitution (no regex escaping pitfalls).
    python3 -c "
import sys
p = sys.argv[1]
needle = sys.argv[2]
replacement = sys.argv[3]
with open(p, 'r', encoding='utf-8', errors='replace') as fh:
    s = fh.read()
s = s.replace(needle, replacement)
with open(p, 'w', encoding='utf-8', newline='') as fh:
    fh.write(s)
" "$f" "$needle" "$replacement"
  done
done

# 2) Color palette swap. ennhealth uses --teal #2C4A5A as primary,
# --gold #D4A855 as secondary. Swap teal → ACCENT, leave gold to
# differentiate sites visually but keep the site cohesive.
python3 -c "
import sys, re
p = 'dist/styles.min.css'
with open(p, 'r', encoding='utf-8', errors='replace') as fh:
    s = fh.read()
# Replace the three teal shades.
s = s.replace('#2C4A5A', '$ACCENT')
s = s.replace('#1a3545', '$ACCENT_DARK')
s = s.replace('#3d6478', '$ACCENT_LIGHT')
# rgba(44,74,90) → accent at low alpha — best-effort: swap to accent's
# rgb. Convert hex to rgb then template.
hex_to_rgb = lambda h: tuple(int(h.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
r, g, b = hex_to_rgb('$ACCENT')
s = re.sub(r'rgba\(44,\s*74,\s*90,', f'rgba({r},{g},{b},', s)
with open(p, 'w', encoding='utf-8', newline='') as fh:
    fh.write(s)
print(f'css color swap: teal -> {r},{g},{b}')
"

# Also swap the inline theme-color meta tag.
python3 -c "
p = 'index.html'
with open(p, 'r', encoding='utf-8', errors='replace') as fh:
    s = fh.read()
s = s.replace('<meta name=\"theme-color\" content=\"#2C4A5A\">', '<meta name=\"theme-color\" content=\"$ACCENT\">')
with open(p, 'w', encoding='utf-8', newline='') as fh:
    fh.write(s)
"

# 3) Surgical section replacements for widget integration.
# Replace booking-section (line range marked) with MemberMD booking widget.
# Replace payment#pricing section with plan-comparison + enrollment widgets.
python3 - <<PYEOF
import re

with open('index.html', 'r', encoding='utf-8') as fh:
    html = fh.read()

# Replace pricing section. Locate by id="pricing" anchor.
pricing_replacement = '''  <section class="payment" id="pricing">
    <div class="payment-inner" style="max-width:1200px;margin:0 auto;padding:0 24px;">
      <div class="section-header">
        <div class="badge">Membership Plans</div>
        <h2>Pick the plan that fits your care</h2>
        <p>Direct Psychiatry Care memberships — flat monthly pricing, no surprise bills, secure messaging with your provider.</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;margin-top:32px;box-shadow:0 4px 16px rgba(15,23,42,.04);">
        <iframe src="${PLATFORM}/#/plans/${TENANT_CODE}" style="display:block;width:100%;border:0;" height="640" loading="lazy" title="Membership plan comparison"></iframe>
      </div>
      <div style="max-width:1200px;margin:36px auto 0;text-align:center;">
        <a href="#enroll" class="btn-primary" style="display:inline-block;text-decoration:none;">Become a member</a>
      </div>
    </div>
  </section>
'''.replace('${PLATFORM}', '$PLATFORM').replace('${TENANT_CODE}', '$TENANT_CODE')

html = re.sub(
    r'<section class="payment" id="pricing">.*?</section>\s*\n',
    pricing_replacement,
    html,
    count=1,
    flags=re.DOTALL,
)

# Replace booking-section with the MemberMD booking widget.
booking_replacement = '''  <section class="booking-section" id="book" aria-label="Schedule your appointment">
    <div class="booking-inner" style="max-width:1200px;margin:0 auto;padding:80px 24px;">
      <div class="section-header">
        <div class="badge">Book Now</div>
        <h2>Schedule your appointment</h2>
        <p>Pick a time that works for you — real-time calendar, HIPAA-compliant booking.</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;margin-top:32px;box-shadow:0 4px 16px rgba(15,23,42,.04);">
        <iframe src="${PLATFORM}/#/book/${TENANT_CODE}" style="display:block;width:100%;border:0;" height="820" loading="lazy" title="Booking widget"></iframe>
      </div>
    </div>
  </section>

  <!-- ─── BECOME A MEMBER (MemberMD enrollment widget) ─── -->
  <section class="enroll-section" id="enroll" style="padding:80px 24px;background:#f8fafb;border-top:1px solid #e2e8f0;">
    <div style="max-width:1200px;margin:0 auto;">
      <div class="section-header">
        <div class="badge">Membership</div>
        <h2>Become a member</h2>
        <p>Join the practice in under 5 minutes. Choose a plan, set up payment, and start booking — all in one secure flow.</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;margin-top:32px;box-shadow:0 4px 16px rgba(15,23,42,.04);">
        <iframe src="${PLATFORM}/#/enroll/${TENANT_CODE}" style="display:block;width:100%;border:0;" height="800" loading="lazy" title="Enrollment widget"></iframe>
      </div>
    </div>
  </section>

  <!-- ─── PATIENT FORMS (MemberMD signature widget) ─── -->
  <section class="signature-section" id="forms" style="padding:80px 24px;border-top:1px solid #e2e8f0;">
    <div style="max-width:1200px;margin:0 auto;">
      <div class="section-header">
        <div class="badge">Patient Forms</div>
        <h2>Sign your forms online</h2>
        <p>Consent, intake, and agreement signing handled before your visit. No paper, no waiting room clipboard.</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;margin-top:32px;box-shadow:0 4px 16px rgba(15,23,42,.04);">
        <iframe src="${PLATFORM}/#/sign/${SIGNATURE_TOKEN}" style="display:block;width:100%;border:0;" height="780" loading="lazy" title="Signature widget"></iframe>
      </div>
    </div>
  </section>
'''.replace('${PLATFORM}', '$PLATFORM').replace('${TENANT_CODE}', '$TENANT_CODE').replace('${SIGNATURE_TOKEN}', '$SIGNATURE_TOKEN')

html = re.sub(
    r'<section class="booking-section" id="book"[^>]*>.*?</section>\s*\n',
    booking_replacement,
    html,
    count=1,
    flags=re.DOTALL,
)

# Update hero CTA + nav to match new section anchors.
# (Both already point at #book and #pricing — no change needed,
# they continue to work after replacement.)

# Update CNAME so each repo doesn't try to claim ennhealth.com.
with open('index.html', 'w', encoding='utf-8') as fh:
    fh.write(html)
PYEOF

# 4) Replace CNAME so the demo site doesn't try to claim ennhealth.com.
echo "${SLUG}.example.com" > CNAME
# Actually GH Pages without a custom domain shouldn't have a CNAME at
# all — remove it so the .github.io subdomain works out of the box.
rm -f CNAME

# 5) Drop the live-site sitemap and SEO files that reference ennhealth.com.
rm -f sitemap.xml robots.txt build-sitemap.sh

# 6) Update the README so the repo is self-explanatory.
cat > README.md <<EOF
# $NAME — widget integration demo

Static demo marketing site embedding MemberMD widgets via iframe.
Cloned and rebranded from ennhealth-psychiatry to validate widget
integration end-to-end on a realistic-looking practice site.

**Live URL:** https://michelevens.github.io/$SLUG/

## What's embedded

- Plan comparison + enrollment widget (in the pricing section)
- Booking widget (in the booking section)
- Signature widget (new "Patient Forms" section)

All four point at MemberMD tenant_code \`$TENANT_CODE\`.

## Updating the widget targets

Re-run \`rebrand.sh\` from the widget-demo-repos working dir with
new \`TENANT_CODE\` / \`SIGNATURE_TOKEN\` env vars, then \`git push\`.

## Tear-down

Delete this repo and run on production:

\`\`\`sql
DELETE FROM practices WHERE slug = 'widget-demo-$SLUG';
\`\`\`
EOF

echo "  ✓ Rebranded to $NAME"

# 7) Init git if not already, commit, push.
if [[ ! -d .git ]]; then
  git init -q -b main
  git remote add origin "https://github.com/michelevens/$SLUG.git"
fi

git add -A
if git -c user.email=demo@membermd.io -c user.name="MemberMD Widget Demo" commit -qm "rebrand: $NAME" 2>/dev/null; then
  git push -u origin main 2>&1 | tail -2
  echo "  ✓ Pushed to https://github.com/michelevens/$SLUG"
else
  echo "  (no changes to commit)"
fi
