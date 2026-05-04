<?php

namespace Database\Seeders;

use App\Models\HelpArticle;
use App\Models\HelpCategory;
use Illuminate\Database\Seeder;

/**
 * Seed initial help-center content. Idempotent on slug — safe to re-run.
 *
 * Categories cover the surfaces practices/patients hit most often:
 * Getting Started, Billing & Payments, Telehealth, Patient Care,
 * Compliance, Integrations.
 */
class HelpCenterSeeder extends Seeder
{
    public function run(): void
    {
        $cats = [
            ['slug' => 'getting-started', 'name' => 'Getting Started', 'icon' => 'BookOpen', 'sort_order' => 1, 'description' => 'Set up your practice and onboard your first members.'],
            ['slug' => 'billing-payments', 'name' => 'Billing & Payments', 'icon' => 'CreditCard', 'sort_order' => 2, 'description' => 'Stripe Connect, recurring billing, and payouts.'],
            ['slug' => 'telehealth', 'name' => 'Telehealth', 'icon' => 'Video', 'sort_order' => 3, 'description' => 'Run video visits with HIPAA-compliant Daily.co.'],
            ['slug' => 'patient-care', 'name' => 'Patient Care', 'icon' => 'Heart', 'sort_order' => 4, 'description' => 'Appointments, encounters, prescriptions, and activity logs.'],
            ['slug' => 'compliance', 'name' => 'Compliance', 'icon' => 'Shield', 'sort_order' => 5, 'description' => 'HIPAA, e-signatures, and audit-ready exports.'],
            ['slug' => 'integrations', 'name' => 'Integrations', 'icon' => 'Puzzle', 'sort_order' => 6, 'description' => 'Webhooks, Zapier, and embeddable widgets.'],
        ];
        $catMap = [];
        foreach ($cats as $c) {
            $cat = HelpCategory::updateOrCreate(['slug' => $c['slug']], $c);
            $catMap[$c['slug']] = $cat->id;
        }

        $articles = [
            // Getting Started
            ['cat' => 'getting-started', 'slug' => 'sign-up-and-set-up-your-practice', 'title' => 'Sign up and set up your practice', 'content' => "Welcome to MemberMD. After registering at /register, complete these onboarding steps:\n\n1. Verify your email — we send a confirmation link to your sign-up address.\n2. Connect Stripe — Practice Settings → Payments. Required to bill members.\n3. Add your branding — Practice Settings → Branding. Upload a logo (PNG/JPG/SVG/WebP, 2MB max) and set your primary color.\n4. Create your first plan — Practice Portal → Plans → Add Plan.\n5. Add at least one provider — Practice Portal → Providers → Add Provider (4-step wizard).\n6. Send the enrollment URL — Practice Settings → Integrations → Embeddable Widgets.\n\nNeed help? Use Cmd+K (Ctrl+K on Windows) anywhere in the app to jump to a section."],
            ['cat' => 'getting-started', 'slug' => 'invite-staff-and-providers', 'title' => 'Invite staff and providers', 'content' => "Practice Portal → Staff or Providers tab → Add. The new user receives an email with a setup link valid for 24 hours. They set their own password.\n\nRoles:\n- **practice_admin** — full access\n- **provider** — clinical work + their own schedule\n- **staff** — appointments, intake, messaging, no clinical write access"],

            // Billing & Payments
            ['cat' => 'billing-payments', 'slug' => 'connect-stripe', 'title' => 'Connect your Stripe account', 'content' => "MemberMD uses Stripe Connect — your members pay you directly, not us.\n\n1. Practice Settings → Payments → Connect Stripe.\n2. Stripe walks you through their identity + bank verification (10–15 minutes).\n3. Once your account is **active**, all your existing plans automatically sync to Stripe Products + Prices.\n4. New plans created after this point auto-sync on save.\n\nWe charge a small platform fee (configurable per-practice) on each successful subscription invoice."],
            ['cat' => 'billing-payments', 'slug' => 'family-billing-and-dependents', 'title' => 'Family billing — one card, multi-member invoice', 'content' => "Plans flagged as **family eligible** allow you to add dependents to a primary member's subscription.\n\n- **Add a dependent**: Patient row → kebab → Add dependent. Fill in spouse/child details.\n- **Stripe handles the math**: each dependent bumps the subscription quantity by 1; the next invoice picks up the prorated charge.\n- **One card, one invoice**: the primary's payment method covers the whole family.\n- **Patient self-serve**: members can view their family list at Patient Portal → Family."],
            ['cat' => 'billing-payments', 'slug' => 'send-payment-link-vs-direct-charge', 'title' => 'Send payment link vs. direct charge', 'content' => "When you convert an intake to a member, MemberMD emails the patient a Stripe Checkout link by default — they enter their own card. This is the safest path for HIPAA + PCI.\n\nIf the patient is sitting in your office, you can collect their card via Stripe's hosted checkout on a tablet, then return to the practice portal.\n\nMemberMD never stores card numbers — Stripe handles all PCI scope."],

            // Telehealth
            ['cat' => 'telehealth', 'slug' => 'start-a-telehealth-visit', 'title' => 'Start a telehealth visit', 'content' => "Telehealth is bundled with every MemberMD subscription — no separate Daily.co or Zoom contract required.\n\n1. Create a telehealth appointment from Practice Portal → Appointments → Book.\n2. The session is auto-created; both you and the patient see a **Join** button on the appointment card.\n3. Click Join → device check (camera/mic) → HIPAA consent → enter the room.\n4. Sessions are end-to-end encrypted via Daily.co.\n\nIf you want to use Zoom or another platform instead, set the appointment's external video URL in the booking dialog."],

            // Patient Care
            ['cat' => 'patient-care', 'slug' => 'log-billable-ccm-rpm-time', 'title' => 'Log billable CCM/RPM time with supervisor approval', 'content' => "For Medicare CCM CPT 99490 (and similar codes), each minute logged by a non-physician must be reviewed by a supervisor before billing.\n\n1. Activity Log tab → log the activity (CCM Time, Care Coordination, etc.) with duration in minutes.\n2. Check **Requires supervisor approval** before saving.\n3. Entry lands in the **Pending approval** queue at the top of the tab.\n4. The supervisor (practice_admin or provider role) clicks Approve → entry is now billable.\n\nApproved entries record who signed off + when, satisfying the audit trail CMS requires."],

            // Compliance
            ['cat' => 'compliance', 'slug' => 'request-an-e-signature', 'title' => 'Request an e-signature from a patient', 'content' => "Patient row → kebab → **Request signature**. Pick a consent template (HIPAA, treatment, ROI, membership agreement, etc.) and optionally add a personal note.\n\nThe patient receives an email with a tokened sign-link. They can also sign in-app from the banner on their portal dashboard. Both paths land at the same /sign/{token} page — they can draw or type their name.\n\nThe completed signature is stored as a ConsentSignature row with version snapshot, IP, and user agent — ESIGN-Act compliant audit trail."],
            ['cat' => 'compliance', 'slug' => 'compliance-command-center', 'title' => 'Read your Compliance Command Center score', 'content' => "Your dashboard shows a single weighted compliance score (0–100) plus a per-component breakdown:\n\n- Patient consents on file (25%)\n- Provider data completeness (20%)\n- Practice profile fields (20%)\n- Stripe Connect status (15%)\n- Custom domain verified (10%)\n- Staff email verification rate (10%)\n\nThe \"Top actions\" list shows the highest-impact fixes. Knock those out first to bump your score."],

            // Integrations
            ['cat' => 'integrations', 'slug' => 'set-up-an-outbound-webhook', 'title' => 'Set up an outbound webhook', 'content' => "Send membership events to your own systems (Slack, Zapier, custom CRM).\n\n1. Practice Settings → Integrations → **Add endpoint**.\n2. Enter the URL that should receive POSTs.\n3. Choose event types — wildcards like `membership.*` are supported.\n4. Save → copy the signing secret immediately (we won't show it again).\n5. Verify deliveries by checking the X-Webhook-Signature header server-side using HMAC-SHA256 + your secret.\n\nFailed deliveries auto-retry with exponential backoff. After 20 consecutive failures, the endpoint auto-disables — re-enable from the same panel."],
            ['cat' => 'integrations', 'slug' => 'embed-the-enrollment-widget', 'title' => 'Embed the enrollment widget on your website', 'content' => "Practice Settings → Integrations → **Embeddable Widgets**.\n\n- **Iframe**: paste the snippet into any page on your site.\n- **Direct link**: share the URL anywhere — email signature, social bio, QR code, etc.\n- **Plan comparison widget**: shows your current plans without asking the patient to enroll yet.\n\nThe widget adapts to your branding (primary color, logo). Submissions land in your Practice Portal → Intake Submissions tab."],
        ];

        foreach ($articles as $a) {
            HelpArticle::updateOrCreate(
                ['slug' => $a['slug']],
                [
                    'help_category_id' => $catMap[$a['cat']],
                    'title' => $a['title'],
                    'content_markdown' => $a['content'],
                    'is_published' => true,
                ],
            );
        }

        $this->command?->info('Seeded ' . count($cats) . ' help categories and ' . count($articles) . ' articles.');
    }
}
