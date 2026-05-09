<?php

namespace App\Console\Commands;

use App\Models\ConsentTemplate;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PlanEntitlement;
use App\Models\Practice;
use App\Models\SignatureRequest;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Clone a source practice three times into demo-only sibling practices,
 * each carrying the same plans + entitlements + a SignatureRequest with
 * a real token so widget-test-sites/ can demo the signature widget too.
 *
 * Usage:
 *   php artisan widgets:seed-test-practices --source="EnnHealth Psychiatry"
 *
 * Idempotent: re-running deletes the previously-seeded demo practices
 * (matched by slug prefix `widget-demo-`) before re-creating, so the
 * demo URLs stay stable but never accumulate dupes.
 *
 * Outputs each new practice's tenant_code + signature token at the end
 * — paste those into widget-test-sites/config.json.
 */
class SeedWidgetTestPractices extends Command
{
    protected $signature = 'widgets:seed-test-practices {--source= : Name of the source practice to clone}';
    protected $description = 'Create three demo practices for widget integration testing.';

    private const DEMO_SLUG_PREFIX = 'widget-demo-';

    // Slugs match the three GH Pages demo repos under michelevens/*.
    // The seed JSON output is keyed by slug so you know which
    // tenant_code goes into which repo's index.html.
    //
    // Admin email uses plus-addressing on contact@ennhealth.com so
    // welcome / billing / notification emails actually deliver to a
    // monitored inbox — the user can see what platform email each
    // demo practice would have received.
    private const DEMO_VARIANTS = [
        [
            'name' => 'Aurora Psychiatry',
            'slug' => 'widget-demo-aurora-psychiatry',
            'color' => '#5B4CB8',
            'admin_email' => 'contact+aurora.admin@ennhealth.com',
        ],
        [
            'name' => 'Cedar Mind Wellness',
            'slug' => 'widget-demo-cedar-mind-wellness',
            'color' => '#1F7A6F',
            'admin_email' => 'contact+cedar.admin@ennhealth.com',
        ],
        [
            'name' => 'Lumen Psychiatry Group',
            'slug' => 'widget-demo-lumen-psychiatry-group',
            'color' => '#C2410C',
            'admin_email' => 'contact+lumen.admin@ennhealth.com',
        ],
    ];

    public function handle(): int
    {
        $sourceName = $this->option('source');
        if (!$sourceName) {
            $this->error('Pass --source="Practice Name" so the command knows what to clone.');
            return self::FAILURE;
        }

        $source = Practice::where('name', $sourceName)->first();
        if (!$source) {
            $this->error("Source practice not found: {$sourceName}");
            return self::FAILURE;
        }

        $sourcePlans = MembershipPlan::where('tenant_id', $source->id)
            ->where('is_active', true)
            ->with('planEntitlements')
            ->get();

        $this->info("Cloning {$sourcePlans->count()} plans from '{$source->name}' into 3 demo practices.");

        // Clean up any prior demo practices first so re-runs don't pile up.
        // Practice delete doesn't cascade to Users / Patient / ConsentTemplate /
        // SignatureRequest, so wipe those by tenant_id first to avoid the
        // users_email_unique violation on re-create.
        $existingDemos = Practice::where('slug', 'like', self::DEMO_SLUG_PREFIX . '%')->get();
        foreach ($existingDemos as $old) {
            $this->warn("Removing existing demo practice: {$old->slug}");
            SignatureRequest::where('tenant_id', $old->id)->delete();
            ConsentTemplate::where('practice_id', $old->id)->delete();
            Patient::where('tenant_id', $old->id)->delete();
            User::where('tenant_id', $old->id)->delete();
            PlanEntitlement::whereIn(
                'plan_id',
                MembershipPlan::where('tenant_id', $old->id)->pluck('id')
            )->delete();
            MembershipPlan::where('tenant_id', $old->id)->delete();
            $old->delete();
        }

        $results = [];

        foreach (self::DEMO_VARIANTS as $variant) {
            $demo = Practice::create([
                'operator_id' => $source->operator_id,
                'name' => $variant['name'],
                'slug' => $variant['slug'],
                'specialty' => $source->specialty,
                'selected_programs' => $source->selected_programs,
                'practice_model' => $source->practice_model,
                'phone' => $source->phone,
                'email' => $variant['admin_email'],
                'owner_email' => $variant['admin_email'],
                'website' => $source->website,
                'address' => $source->address,
                'city' => $source->city,
                'state' => $source->state,
                'zip' => $source->zip,
                'logo_url' => $source->logo_url,
                'primary_color' => $variant['color'],
                'tagline' => 'Widget integration test site — ' . substr($variant['slug'], -1),
                // tenant_code is auto-generated by Practice::booted()
                'subscription_plan' => $source->subscription_plan,
                'subscription_status' => 'active',
                'billing_enforced' => false,
                'settings' => $source->settings,
                'utilization_settings' => $source->utilization_settings,
                'branding' => $source->branding,
                'is_active' => true,
                'timezone' => $source->timezone ?? 'America/New_York',
            ]);

            // Clone plans + their entitlements. Stripe price ids are
            // intentionally NOT copied — these are demo plans that
            // shouldn't share billing config with the source.
            foreach ($sourcePlans as $plan) {
                $newPlan = MembershipPlan::create([
                    'tenant_id' => $demo->id,
                    'program_id' => $plan->program_id,
                    'name' => $plan->name,
                    'description' => $plan->description,
                    'badge_text' => $plan->badge_text,
                    'monthly_price' => $plan->monthly_price,
                    'annual_price' => $plan->annual_price,
                    'enrollment_fee' => $plan->enrollment_fee,
                    'enrollment_fee_explanation' => $plan->enrollment_fee_explanation,
                    'intake_fee' => $plan->intake_fee,
                    'trial_days' => $plan->trial_days,
                    'visits_per_month' => $plan->visits_per_month,
                    'telehealth_included' => $plan->telehealth_included,
                    'messaging_included' => $plan->messaging_included,
                    'crisis_support' => $plan->crisis_support,
                    'lab_discount_pct' => $plan->lab_discount_pct,
                    'prescription_management' => $plan->prescription_management,
                    'specialist_referrals' => $plan->specialist_referrals,
                    'care_plan_included' => $plan->care_plan_included,
                    'visit_rollover' => $plan->visit_rollover,
                    'overage_fee' => $plan->overage_fee,
                    'family_eligible' => $plan->family_eligible,
                    'family_member_price' => $plan->family_member_price,
                    'min_commitment_months' => $plan->min_commitment_months,
                    'features_list' => $plan->features_list,
                    'sort_order' => $plan->sort_order,
                    'is_active' => true,
                ]);

                foreach ($plan->planEntitlements as $pe) {
                    PlanEntitlement::create([
                        'plan_id' => $newPlan->id,
                        'entitlement_type_id' => $pe->entitlement_type_id,
                        'quantity_limit' => $pe->quantity_limit,
                        'is_unlimited' => $pe->is_unlimited,
                        'period_type' => $pe->period_type,
                        'rollover_enabled' => $pe->rollover_enabled,
                        'rollover_max' => $pe->rollover_max,
                        'overage_policy' => $pe->overage_policy,
                        'overage_fee' => $pe->overage_fee,
                        'family_shared' => $pe->family_shared,
                        'included_value' => $pe->included_value,
                        'discount_percentage' => $pe->discount_percentage,
                        'notes' => $pe->notes,
                        'sort_order' => $pe->sort_order,
                        'is_active' => true,
                    ]);
                }
            }

            // Practice admin user — uses the practice's admin_email so
            // welcome / billing / notification emails route to a
            // monitored inbox (contact@ennhealth.com via plus-addressing).
            // Password is set to a known temporary value so the user
            // can log in and verify the demo end-to-end. Print it in
            // the result block; the user can rotate via "forgot password"
            // immediately after first login.
            $tempAdminPassword = 'WidgetDemo!' . Str::random(8);
            User::create([
                'tenant_id' => $demo->id,
                'name' => $variant['name'] . ' Admin',
                'first_name' => 'Demo',
                'last_name' => 'Admin',
                'email' => $variant['admin_email'],
                'password' => bcrypt($tempAdminPassword),
                'role' => 'practice_admin',
                'status' => 'active',
            ]);

            // A throwaway patient + ConsentTemplate + SignatureRequest so
            // the signature widget on the demo site has a real token to
            // mount against. Tokens never expire (set far-future) so the
            // demo doesn't go stale on us.
            // Use Str::random rather than substr($demo->id, 0, 8) — UUIDv7
            // IDs created in the same second share the time prefix and
            // collide on users.email_unique.
            $demoUserEmail = 'demo-patient+' . Str::lower(Str::random(12)) . '@membermd.io';
            $demoUser = User::create([
                'tenant_id' => $demo->id,
                'name' => 'Demo Patient',
                'first_name' => 'Demo',
                'last_name' => 'Patient',
                'email' => $demoUserEmail,
                'password' => bcrypt(Str::random(32)),
                'role' => 'patient',
                'status' => 'active',
            ]);
            $demoPatient = Patient::create([
                'tenant_id' => $demo->id,
                'user_id' => $demoUser->id,
                'first_name' => 'Demo',
                'last_name' => 'Patient',
                'email' => $demoUserEmail,
                'phone' => '555-0100',
                'date_of_birth' => '1990-01-01',
                'is_active' => true,
            ]);

            $template = ConsentTemplate::create([
                'practice_id' => $demo->id,
                'name' => 'Membership agreement (demo)',
                'type' => 'membership_agreement',
                'content' => "<h2>Membership Agreement</h2><p>This is a demo consent for the widget integration test site. By signing below you acknowledge that this is a non-production environment used solely for embed testing.</p>",
                'version' => '1.0',
                'is_active' => true,
                'requires_signature' => true,
            ]);

            $sigRequest = SignatureRequest::create([
                'tenant_id' => $demo->id,
                'patient_id' => $demoPatient->id,
                'template_id' => $template->id,
                'public_token' => Str::random(48),
                'status' => 'pending',
                'expires_at' => now()->addYears(5),
            ]);

            $results[] = [
                'name' => $demo->name,
                'slug' => $demo->slug,
                'tenant_code' => $demo->tenant_code,
                'primary_color' => $variant['color'],
                'signature_token' => $sigRequest->public_token,
                'admin_email' => $variant['admin_email'],
                'admin_temp_password' => $tempAdminPassword,
            ];

            $this->info("✓ {$demo->name} — tenant_code={$demo->tenant_code}");
        }

        $this->newLine();
        $this->info('Done. Use this output to wire up the demo widget sites:');
        $this->line(json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->newLine();
        $this->warn('Admin temp passwords are sensitive — rotate via "forgot password" on first login.');

        return self::SUCCESS;
    }
}
