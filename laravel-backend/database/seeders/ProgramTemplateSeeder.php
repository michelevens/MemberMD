<?php

namespace Database\Seeders;

use App\Models\Program;
use App\Models\ProgramPlan;
use App\Models\ProgramEligibilityRule;
use App\Models\ProgramFundingSource;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;

class ProgramTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $programs = [
            [
                'name' => 'Direct Primary Care (DPC)',
                'code' => 'dpc',
                'type' => 'membership',
                'description' => 'Membership-based primary care with unlimited or capped visits, messaging, and telehealth. Patients pay a monthly/annual fee directly to the practice.',
                'duration_type' => 'ongoing',
                'specialties' => ['primary_care', 'family_medicine', 'internal_medicine', 'pediatrics'],
                'default_plans' => [
                    ['name' => 'Essential', 'monthly_price' => 99, 'annual_price' => 1069, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 2, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 48, 'lab_discount_pct' => 10, 'crisis_support' => false]],
                    ['name' => 'Complete', 'monthly_price' => 199, 'annual_price' => 2149, 'badge_text' => 'Most Popular',
                     'entitlements' => ['visits_per_month' => 4, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 24, 'lab_discount_pct' => 25, 'crisis_support' => false, 'care_plan' => true]],
                    ['name' => 'Premium', 'monthly_price' => 299, 'annual_price' => 3229, 'badge_text' => 'Best Value',
                     'entitlements' => ['visits_per_month' => -1, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 4, 'lab_discount_pct' => 40, 'crisis_support' => true, 'care_plan' => true, 'specialist_referrals' => true]],
                ],
                'default_eligibility' => [],
                'default_funding' => [['source_type' => 'stripe_subscription', 'name' => 'Member Subscription', 'billing_frequency' => 'monthly']],
            ],
            [
                'name' => 'Chronic Care Management (CCM)',
                'code' => 'ccm',
                'type' => 'insurance_billed',
                'description' => 'CMS-reimbursable chronic care management for patients with 2+ chronic conditions. Billed monthly via CPT 99490 (20 min) and 99491 (30 min complex).',
                'duration_type' => 'ongoing',
                'specialties' => ['primary_care', 'internal_medicine', 'endocrinology', 'cardiology', 'family_medicine'],
                'default_plans' => [
                    ['name' => 'Standard CCM', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Insurance Billed',
                     'entitlements' => ['care_coordination_minutes' => 20, 'telehealth' => true, 'messaging' => true, 'care_plan' => true, 'medication_reconciliation' => true]],
                    ['name' => 'Complex CCM', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Complex',
                     'entitlements' => ['care_coordination_minutes' => 60, 'telehealth' => true, 'messaging' => true, 'care_plan' => true, 'medication_reconciliation' => true, 'specialist_coordination' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'diagnosis', 'operator' => 'min_count', 'value' => ['count' => 2, 'category' => 'chronic'], 'description' => 'Patient must have 2+ chronic conditions'],
                    ['rule_type' => 'insurance_type', 'operator' => 'in', 'value' => ['medicare', 'medicare_advantage'], 'description' => 'Medicare or Medicare Advantage required'],
                ],
                'default_funding' => [['source_type' => 'insurance_claim', 'name' => 'Medicare CCM', 'billing_frequency' => 'monthly', 'cpt_code' => '99490']],
            ],
            [
                'name' => 'Psychiatric Direct Care',
                'code' => 'psychiatric_dpc',
                'type' => 'membership',
                'description' => 'Membership-based psychiatric care with medication management, therapy sessions, and crisis support. Tailored for outpatient mental health.',
                'duration_type' => 'ongoing',
                'specialties' => ['psychiatry', 'addiction_medicine'],
                'default_plans' => [
                    ['name' => 'Essential', 'monthly_price' => 149, 'annual_price' => 1609, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 1, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 48, 'med_management' => true]],
                    ['name' => 'Complete', 'monthly_price' => 249, 'annual_price' => 2689, 'badge_text' => 'Most Popular',
                     'entitlements' => ['visits_per_month' => 2, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 24, 'med_management' => true, 'therapy_sessions' => 2]],
                    ['name' => 'Premium', 'monthly_price' => 399, 'annual_price' => 4309, 'badge_text' => 'Comprehensive',
                     'entitlements' => ['visits_per_month' => 4, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 4, 'med_management' => true, 'therapy_sessions' => 4, 'crisis_support' => true, 'genetic_testing' => true]],
                ],
                'default_eligibility' => [],
                'default_funding' => [['source_type' => 'stripe_subscription', 'name' => 'Member Subscription', 'billing_frequency' => 'monthly']],
            ],
            [
                'name' => 'Concierge Medicine',
                'code' => 'concierge',
                'type' => 'hybrid',
                'description' => 'Retainer-based access plus insurance billing. Annual retainer guarantees same/next-day access, extended visits, and direct provider communication.',
                'duration_type' => 'ongoing',
                'specialties' => ['primary_care', 'internal_medicine', 'family_medicine', 'cardiology', 'dermatology'],
                'default_plans' => [
                    ['name' => 'Annual Retainer', 'monthly_price' => 250, 'annual_price' => 2500, 'badge_text' => 'Concierge',
                     'entitlements' => ['visits_per_month' => -1, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 2, 'same_day_access' => true, 'extended_visits' => true, 'direct_phone' => true, 'annual_wellness' => true]],
                ],
                'default_eligibility' => [],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Annual Retainer', 'billing_frequency' => 'annual'],
                    ['source_type' => 'insurance_claim', 'name' => 'Visit Billing', 'billing_frequency' => 'per_visit'],
                ],
            ],
            [
                'name' => 'Health Coaching',
                'code' => 'coaching',
                'type' => 'membership',
                'description' => 'Structured health coaching programs for lifestyle modification, weight management, stress reduction, and chronic condition self-management.',
                'duration_type' => 'fixed_term',
                'duration_months' => 3,
                'specialties' => ['primary_care', 'functional_medicine', 'internal_medicine', 'endocrinology'],
                'default_plans' => [
                    ['name' => 'Individual Coaching', 'monthly_price' => 149, 'annual_price' => 0, 'badge_text' => null,
                     'entitlements' => ['coaching_sessions' => 4, 'messaging' => true, 'goal_tracking' => true, 'resource_library' => true]],
                    ['name' => 'Intensive Coaching', 'monthly_price' => 299, 'annual_price' => 0, 'badge_text' => 'Recommended',
                     'entitlements' => ['coaching_sessions' => 8, 'messaging' => true, 'goal_tracking' => true, 'resource_library' => true, 'meal_planning' => true, 'fitness_plan' => true]],
                ],
                'default_eligibility' => [],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Member Payment', 'billing_frequency' => 'monthly'],
                    ['source_type' => 'employer_invoice', 'name' => 'Employer Sponsor', 'billing_frequency' => 'monthly'],
                ],
            ],
            [
                'name' => 'Employer Wellness',
                'code' => 'employer_wellness',
                'type' => 'sponsor_based',
                'description' => 'Employer-sponsored wellness programs including biometric screenings, health coaching, and preventive care for employee populations.',
                'duration_type' => 'fixed_term',
                'duration_months' => 12,
                'specialties' => ['primary_care', 'functional_medicine', 'internal_medicine'],
                'default_plans' => [
                    ['name' => 'Basic Wellness', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Employer Paid',
                     'entitlements' => ['annual_screening' => true, 'coaching_sessions' => 2, 'health_risk_assessment' => true]],
                    ['name' => 'Comprehensive Wellness', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Full Program',
                     'entitlements' => ['annual_screening' => true, 'coaching_sessions' => 12, 'health_risk_assessment' => true, 'telehealth' => true, 'messaging' => true, 'fitness_plan' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'employer', 'operator' => 'equals', 'value' => ['requires_sponsor' => true], 'description' => 'Must be enrolled by participating employer'],
                ],
                'default_funding' => [['source_type' => 'employer_invoice', 'name' => 'Employer Contract', 'billing_frequency' => 'monthly']],
            ],
            [
                'name' => 'Group Therapy',
                'code' => 'group_therapy',
                'type' => 'membership',
                'description' => 'Structured group therapy programs (DBT, CBT, process groups) with defined session counts and curricula.',
                'duration_type' => 'fixed_term',
                'duration_months' => 3,
                'specialties' => ['psychiatry', 'addiction_medicine', 'pain_management'],
                'default_plans' => [
                    ['name' => 'Group Sessions', 'monthly_price' => 120, 'annual_price' => 0, 'badge_text' => null,
                     'entitlements' => ['group_sessions_per_week' => 1, 'resource_library' => true, 'peer_messaging' => true]],
                    ['name' => 'Group + Individual', 'monthly_price' => 250, 'annual_price' => 0, 'badge_text' => 'Recommended',
                     'entitlements' => ['group_sessions_per_week' => 1, 'individual_sessions' => 2, 'resource_library' => true, 'peer_messaging' => true, 'crisis_support' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'referral_required', 'operator' => 'equals', 'value' => true, 'description' => 'Provider referral required for group enrollment'],
                ],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Member Payment', 'billing_frequency' => 'monthly'],
                    ['source_type' => 'insurance_claim', 'name' => 'Insurance', 'billing_frequency' => 'per_visit', 'cpt_code' => '90853'],
                ],
            ],
            [
                'name' => 'Recovery & MAT',
                'code' => 'recovery',
                'type' => 'hybrid',
                'description' => 'Medication-Assisted Treatment and recovery support programs for substance use disorders. Combines medication management with counseling.',
                'duration_type' => 'ongoing',
                'specialties' => ['addiction_medicine', 'psychiatry'],
                'default_plans' => [
                    ['name' => 'MAT Standard', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Insurance + Sliding Scale',
                     'entitlements' => ['med_management' => true, 'counseling_sessions' => 4, 'drug_screening' => true, 'peer_support' => true, 'crisis_support' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'diagnosis', 'operator' => 'in', 'value' => ['F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19'], 'description' => 'Substance use disorder diagnosis required'],
                ],
                'default_funding' => [
                    ['source_type' => 'insurance_claim', 'name' => 'Insurance', 'billing_frequency' => 'per_visit'],
                    ['source_type' => 'sliding_scale', 'name' => 'Sliding Scale', 'billing_frequency' => 'per_visit'],
                    ['source_type' => 'grant', 'name' => 'SAMHSA Grant', 'billing_frequency' => 'quarterly'],
                ],
            ],
        ];

        $seeded = 0;

        foreach ($programs as $programData) {
            try {
                $defaultPlans = $programData['default_plans'] ?? [];
                $defaultEligibility = $programData['default_eligibility'] ?? [];
                $defaultFunding = $programData['default_funding'] ?? [];
                unset($programData['default_plans'], $programData['default_eligibility'], $programData['default_funding']);

                // Duration months only applies to fixed_term
                if (!isset($programData['duration_months'])) {
                    $programData['duration_months'] = null;
                }

                $program = Program::withoutGlobalScope('tenant')->updateOrCreate(
                    ['code' => $programData['code'], 'is_template' => true, 'tenant_id' => null],
                    array_merge($programData, [
                        'is_template' => true,
                        'tenant_id' => null,
                        'status' => 'active',
                        'is_active' => true,
                    ])
                );

                // Seed plans (updateOrCreate on program_id + name)
                foreach ($defaultPlans as $index => $planData) {
                    ProgramPlan::updateOrCreate(
                        ['program_id' => $program->id, 'name' => $planData['name']],
                        array_merge($planData, [
                            'sort_order' => $index,
                            'is_active' => true,
                        ])
                    );
                }

                // Seed eligibility rules (updateOrCreate on program_id + rule_type + operator)
                // First, remove old rules that no longer exist
                $existingRuleKeys = collect($defaultEligibility)->map(fn ($r) => $r['rule_type'] . '|' . $r['operator']);
                ProgramEligibilityRule::where('program_id', $program->id)
                    ->get()
                    ->each(function ($rule) use ($existingRuleKeys) {
                        $key = $rule->rule_type . '|' . $rule->operator;
                        if (!$existingRuleKeys->contains($key)) {
                            $rule->delete();
                        }
                    });

                foreach ($defaultEligibility as $ruleData) {
                    ProgramEligibilityRule::updateOrCreate(
                        ['program_id' => $program->id, 'rule_type' => $ruleData['rule_type'], 'operator' => $ruleData['operator']],
                        $ruleData
                    );
                }

                // Seed funding sources (updateOrCreate on program_id + source_type + name)
                foreach ($defaultFunding as $fsData) {
                    ProgramFundingSource::updateOrCreate(
                        ['program_id' => $program->id, 'source_type' => $fsData['source_type'], 'name' => $fsData['name']],
                        $fsData
                    );
                }

                $seeded++;
            } catch (\Throwable $e) {
                $this->command->error("Failed to seed program '{$programData['name']}': " . $e->getMessage());
                Log::error('ProgramTemplateSeeder failed', [
                    'program' => $programData['name'] ?? 'unknown',
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $this->command->info("Seeded {$seeded} program templates.");
    }
}
