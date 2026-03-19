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
            [
                'name' => 'Employee Assistance Program (EAP)',
                'code' => 'eap',
                'type' => 'sponsor_based',
                'description' => 'Employer-sponsored confidential counseling and support services. Provides short-term counseling, crisis intervention, work-life referrals, and legal/financial consultations. Utilization data is aggregate-only — individual sessions are strictly confidential.',
                'duration_type' => 'ongoing',
                'specialties' => ['psychiatry', 'addiction_medicine', 'primary_care', 'family_medicine', 'internal_medicine'],
                'default_plans' => [
                    ['name' => 'Standard EAP', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Employer Paid',
                     'entitlements' => ['counseling_sessions_per_issue' => 6, 'crisis_hotline' => true, 'work_life_referrals' => true, 'legal_consult_hours' => 1, 'financial_consult_hours' => 1, 'confidential' => true]],
                    ['name' => 'Enhanced EAP', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Premium',
                     'entitlements' => ['counseling_sessions_per_issue' => 12, 'crisis_hotline' => true, 'work_life_referrals' => true, 'legal_consult_hours' => 3, 'financial_consult_hours' => 3, 'telehealth' => true, 'messaging' => true, 'substance_abuse_evaluation' => true, 'manager_consultation' => true, 'confidential' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'employer', 'operator' => 'equals', 'value' => ['requires_sponsor' => true], 'description' => 'Must be employee or dependent of participating employer'],
                ],
                'default_funding' => [
                    ['source_type' => 'employer_invoice', 'name' => 'Employer PEPM Contract', 'billing_frequency' => 'monthly'],
                ],
            ],
            [
                'name' => 'Diabetes Management',
                'code' => 'diabetes',
                'type' => 'hybrid',
                'description' => 'Comprehensive diabetes management program combining glucose monitoring, medication management, nutrition coaching, and A1C tracking. Can be funded via membership, insurance (CCM/RPM), or employer sponsorship.',
                'duration_type' => 'ongoing',
                'specialties' => ['primary_care', 'internal_medicine', 'endocrinology', 'family_medicine', 'functional_medicine'],
                'default_plans' => [
                    ['name' => 'Diabetes Essential', 'monthly_price' => 149, 'annual_price' => 1609, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 1, 'telehealth' => true, 'messaging' => true, 'glucose_monitoring' => true, 'a1c_tracking' => true, 'medication_management' => true, 'nutrition_coaching' => false]],
                    ['name' => 'Diabetes Complete', 'monthly_price' => 249, 'annual_price' => 2689, 'badge_text' => 'Most Popular',
                     'entitlements' => ['visits_per_month' => 2, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 24, 'glucose_monitoring' => true, 'cgm_device' => true, 'a1c_tracking' => true, 'medication_management' => true, 'nutrition_coaching' => true, 'coaching_sessions' => 2, 'lab_discount_pct' => 20]],
                    ['name' => 'Diabetes Intensive', 'monthly_price' => 399, 'annual_price' => 4309, 'badge_text' => 'Comprehensive',
                     'entitlements' => ['visits_per_month' => 4, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 4, 'glucose_monitoring' => true, 'cgm_device' => true, 'rpm_monitoring' => true, 'a1c_tracking' => true, 'medication_management' => true, 'insulin_management' => true, 'nutrition_coaching' => true, 'coaching_sessions' => 4, 'meal_planning' => true, 'exercise_plan' => true, 'lab_discount_pct' => 40, 'specialist_referrals' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'diagnosis', 'operator' => 'in', 'value' => ['E10', 'E11', 'E13', 'R73.03'], 'description' => 'Diabetes (Type 1, Type 2, Other) or prediabetes diagnosis required'],
                ],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Member Subscription', 'billing_frequency' => 'monthly'],
                    ['source_type' => 'insurance_claim', 'name' => 'CCM Billing', 'billing_frequency' => 'monthly', 'cpt_code' => '99490'],
                    ['source_type' => 'insurance_claim', 'name' => 'RPM Billing', 'billing_frequency' => 'monthly', 'cpt_code' => '99454'],
                    ['source_type' => 'employer_invoice', 'name' => 'Employer Wellness', 'billing_frequency' => 'monthly'],
                ],
            ],
            [
                'name' => 'Remote Patient Monitoring (RPM)',
                'code' => 'rpm',
                'type' => 'insurance_billed',
                'description' => 'CMS-reimbursable remote physiologic monitoring using connected devices (blood pressure cuffs, glucose monitors, pulse oximeters, scales). Billed via CPT 99453/99454/99457/99458.',
                'duration_type' => 'ongoing',
                'specialties' => ['primary_care', 'internal_medicine', 'cardiology', 'endocrinology', 'family_medicine', 'geriatrics'],
                'default_plans' => [
                    ['name' => 'RPM Standard', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Insurance Billed',
                     'entitlements' => ['device_setup' => true, 'daily_monitoring' => true, 'monthly_review' => true, 'telehealth' => true, 'alert_thresholds' => true, 'care_coordination_minutes' => 20]],
                    ['name' => 'RPM + CCM', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Combined',
                     'entitlements' => ['device_setup' => true, 'daily_monitoring' => true, 'monthly_review' => true, 'telehealth' => true, 'alert_thresholds' => true, 'care_coordination_minutes' => 40, 'care_plan' => true, 'medication_reconciliation' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'diagnosis', 'operator' => 'in', 'value' => ['I10', 'E11', 'I50', 'J44', 'E78'], 'description' => 'Chronic condition requiring remote monitoring (HTN, DM, CHF, COPD, hyperlipidemia)'],
                    ['rule_type' => 'insurance_type', 'operator' => 'in', 'value' => ['medicare', 'medicare_advantage', 'commercial'], 'description' => 'Medicare, Medicare Advantage, or commercial insurance'],
                ],
                'default_funding' => [
                    ['source_type' => 'insurance_claim', 'name' => 'Device Setup', 'billing_frequency' => 'one_time', 'cpt_code' => '99453'],
                    ['source_type' => 'insurance_claim', 'name' => 'Device Supply', 'billing_frequency' => 'monthly', 'cpt_code' => '99454'],
                    ['source_type' => 'insurance_claim', 'name' => 'RPM Management (first 20 min)', 'billing_frequency' => 'monthly', 'cpt_code' => '99457'],
                    ['source_type' => 'insurance_claim', 'name' => 'RPM Management (each add\'l 20 min)', 'billing_frequency' => 'monthly', 'cpt_code' => '99458'],
                ],
            ],
            [
                'name' => 'Weight Management',
                'code' => 'weight_management',
                'type' => 'membership',
                'description' => 'Medical weight management program including GLP-1 prescriptions, nutrition counseling, fitness planning, and regular monitoring. High demand with Ozempic/Wegovy/Mounjaro.',
                'duration_type' => 'fixed_term',
                'duration_months' => 6,
                'specialties' => ['primary_care', 'internal_medicine', 'endocrinology', 'family_medicine', 'functional_medicine'],
                'default_plans' => [
                    ['name' => 'Weight Loss Basic', 'monthly_price' => 199, 'annual_price' => 0, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 1, 'telehealth' => true, 'messaging' => true, 'weight_tracking' => true, 'nutrition_counseling' => true, 'medication_management' => true]],
                    ['name' => 'Weight Loss Plus', 'monthly_price' => 349, 'annual_price' => 0, 'badge_text' => 'Most Popular',
                     'entitlements' => ['visits_per_month' => 2, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 24, 'weight_tracking' => true, 'nutrition_counseling' => true, 'meal_planning' => true, 'exercise_plan' => true, 'medication_management' => true, 'glp1_coordination' => true, 'lab_discount_pct' => 20]],
                    ['name' => 'Weight Loss Premium', 'monthly_price' => 549, 'annual_price' => 0, 'badge_text' => 'All-Inclusive',
                     'entitlements' => ['visits_per_month' => 4, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 4, 'weight_tracking' => true, 'body_composition' => true, 'nutrition_counseling' => true, 'meal_planning' => true, 'exercise_plan' => true, 'coaching_sessions' => 4, 'medication_management' => true, 'glp1_coordination' => true, 'lab_discount_pct' => 40, 'genetic_testing' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'diagnosis', 'operator' => 'in', 'value' => ['E66', 'E66.01', 'E66.09', 'Z68.3', 'Z68.4'], 'description' => 'Obesity or overweight diagnosis (BMI 25+)'],
                ],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Member Subscription', 'billing_frequency' => 'monthly'],
                ],
            ],
            [
                'name' => 'Pediatric DPC',
                'code' => 'pediatric_dpc',
                'type' => 'membership',
                'description' => 'Membership-based pediatric care with well-child visits, immunizations, sick visits, and developmental screenings. Family-friendly pricing with sibling discounts.',
                'duration_type' => 'ongoing',
                'specialties' => ['pediatrics', 'family_medicine'],
                'default_plans' => [
                    ['name' => 'Single Child', 'monthly_price' => 79, 'annual_price' => 853, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 2, 'telehealth' => true, 'messaging' => true, 'well_child_visits' => true, 'immunizations' => true, 'sick_visits' => true, 'developmental_screening' => true]],
                    ['name' => 'Family Plan', 'monthly_price' => 149, 'annual_price' => 1609, 'badge_text' => 'Best for Families',
                     'entitlements' => ['visits_per_month' => -1, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 24, 'well_child_visits' => true, 'immunizations' => true, 'sick_visits' => true, 'developmental_screening' => true, 'sports_physicals' => true, 'max_children' => 3, 'additional_child_price' => 29]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'age_range', 'operator' => 'between', 'value' => ['min' => 0, 'max' => 18], 'description' => 'Ages 0-18'],
                ],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Family Subscription', 'billing_frequency' => 'monthly'],
                ],
            ],
            [
                'name' => 'Women\'s Health',
                'code' => 'womens_health',
                'type' => 'membership',
                'description' => 'Comprehensive women\'s health program covering reproductive health, hormonal management, prenatal care, menopause support, and preventive screenings.',
                'duration_type' => 'ongoing',
                'specialties' => ['ob_gyn', 'family_medicine', 'internal_medicine', 'endocrinology', 'functional_medicine'],
                'default_plans' => [
                    ['name' => 'Essential', 'monthly_price' => 129, 'annual_price' => 1393, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 1, 'telehealth' => true, 'messaging' => true, 'annual_wellness' => true, 'pap_smear' => true, 'hormonal_screening' => true]],
                    ['name' => 'Complete', 'monthly_price' => 229, 'annual_price' => 2473, 'badge_text' => 'Most Popular',
                     'entitlements' => ['visits_per_month' => 2, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 24, 'annual_wellness' => true, 'pap_smear' => true, 'hormonal_screening' => true, 'hormone_management' => true, 'menopause_support' => true, 'nutrition_counseling' => true, 'lab_discount_pct' => 25]],
                    ['name' => 'Prenatal', 'monthly_price' => 349, 'annual_price' => 0, 'badge_text' => 'Pregnancy',
                     'entitlements' => ['visits_per_month' => 4, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 4, 'prenatal_visits' => true, 'ultrasound_coordination' => true, 'nutrition_counseling' => true, 'birth_planning' => true, 'postpartum_support' => true, 'lab_discount_pct' => 30]],
                ],
                'default_eligibility' => [],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Member Subscription', 'billing_frequency' => 'monthly'],
                    ['source_type' => 'insurance_claim', 'name' => 'Preventive Services', 'billing_frequency' => 'per_visit'],
                ],
            ],
            [
                'name' => 'Executive Health',
                'code' => 'executive_health',
                'type' => 'membership',
                'description' => 'Premium annual executive physicals with comprehensive diagnostics, followed by ongoing concierge access. Designed for C-suite executives and high-net-worth individuals.',
                'duration_type' => 'ongoing',
                'specialties' => ['primary_care', 'internal_medicine', 'cardiology', 'functional_medicine'],
                'default_plans' => [
                    ['name' => 'Executive Annual', 'monthly_price' => 0, 'annual_price' => 5000, 'badge_text' => 'Premium',
                     'entitlements' => ['executive_physical' => true, 'comprehensive_labs' => true, 'cardiac_screening' => true, 'cancer_screening' => true, 'fitness_assessment' => true, 'nutrition_assessment' => true, 'visits_per_month' => 2, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 2, 'same_day_access' => true, 'direct_phone' => true, 'travel_medicine' => true]],
                ],
                'default_eligibility' => [],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Annual Membership', 'billing_frequency' => 'annual'],
                    ['source_type' => 'employer_invoice', 'name' => 'Corporate Executive Program', 'billing_frequency' => 'annual'],
                ],
            ],
            [
                'name' => 'Transitional Care Management (TCM)',
                'code' => 'tcm',
                'type' => 'insurance_billed',
                'description' => 'CMS-reimbursable post-discharge care management. Provides follow-up within 2 business days of hospital/SNF discharge with 30-day care coordination. CPT 99495/99496.',
                'duration_type' => 'fixed_term',
                'duration_months' => 1,
                'specialties' => ['primary_care', 'internal_medicine', 'cardiology', 'family_medicine', 'geriatrics'],
                'default_plans' => [
                    ['name' => 'TCM Moderate', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Insurance Billed',
                     'entitlements' => ['post_discharge_call' => true, 'follow_up_visit' => true, 'medication_reconciliation' => true, 'care_coordination' => true, 'follow_up_within_days' => 14]],
                    ['name' => 'TCM High Complexity', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Complex',
                     'entitlements' => ['post_discharge_call' => true, 'follow_up_visit' => true, 'medication_reconciliation' => true, 'care_coordination' => true, 'specialist_coordination' => true, 'follow_up_within_days' => 7]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'custom', 'operator' => 'equals', 'value' => ['recently_discharged' => true], 'description' => 'Patient discharged from inpatient facility within last 2 business days'],
                    ['rule_type' => 'insurance_type', 'operator' => 'in', 'value' => ['medicare', 'medicare_advantage'], 'description' => 'Medicare or Medicare Advantage'],
                ],
                'default_funding' => [
                    ['source_type' => 'insurance_claim', 'name' => 'TCM Moderate (14-day F/U)', 'billing_frequency' => 'per_episode', 'cpt_code' => '99495'],
                    ['source_type' => 'insurance_claim', 'name' => 'TCM High (7-day F/U)', 'billing_frequency' => 'per_episode', 'cpt_code' => '99496'],
                ],
            ],
            [
                'name' => 'Chronic Pain Management',
                'code' => 'chronic_pain',
                'type' => 'hybrid',
                'description' => 'Non-opioid chronic pain management program combining medication management, physical therapy coordination, interventional procedures, and behavioral health support.',
                'duration_type' => 'ongoing',
                'specialties' => ['pain_management', 'primary_care', 'internal_medicine', 'functional_medicine'],
                'default_plans' => [
                    ['name' => 'Pain Management Basic', 'monthly_price' => 179, 'annual_price' => 1933, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 1, 'telehealth' => true, 'messaging' => true, 'medication_management' => true, 'pain_assessment' => true, 'pt_coordination' => true]],
                    ['name' => 'Pain Management Complete', 'monthly_price' => 329, 'annual_price' => 3553, 'badge_text' => 'Comprehensive',
                     'entitlements' => ['visits_per_month' => 3, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 24, 'medication_management' => true, 'pain_assessment' => true, 'pt_coordination' => true, 'behavioral_health' => true, 'acupuncture_referral' => true, 'injection_procedures' => true, 'lab_discount_pct' => 20]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'diagnosis', 'operator' => 'in', 'value' => ['G89', 'M54', 'M79', 'G43', 'M25.5'], 'description' => 'Chronic pain, back pain, fibromyalgia, migraine, or joint pain diagnosis'],
                ],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Member Subscription', 'billing_frequency' => 'monthly'],
                    ['source_type' => 'insurance_claim', 'name' => 'Office Visits', 'billing_frequency' => 'per_visit'],
                ],
            ],
            [
                'name' => 'Geriatric Care',
                'code' => 'geriatric_care',
                'type' => 'hybrid',
                'description' => 'Comprehensive senior care program with medication management, fall prevention, cognitive screening, care coordination, and caregiver support. Combines membership access with Medicare billing.',
                'duration_type' => 'ongoing',
                'specialties' => ['geriatrics', 'primary_care', 'internal_medicine', 'family_medicine'],
                'default_plans' => [
                    ['name' => 'Senior Essential', 'monthly_price' => 149, 'annual_price' => 1609, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 2, 'telehealth' => true, 'messaging' => true, 'medication_review' => true, 'fall_risk_assessment' => true, 'cognitive_screening' => true, 'annual_wellness' => true]],
                    ['name' => 'Senior Complete', 'monthly_price' => 279, 'annual_price' => 3013, 'badge_text' => 'Comprehensive',
                     'entitlements' => ['visits_per_month' => 4, 'telehealth' => true, 'messaging' => true, 'messaging_sla_hours' => 12, 'medication_review' => true, 'fall_risk_assessment' => true, 'cognitive_screening' => true, 'annual_wellness' => true, 'home_visit' => true, 'caregiver_support' => true, 'advance_directive' => true, 'specialist_coordination' => true, 'lab_discount_pct' => 25]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'age_range', 'operator' => 'greater_than', 'value' => ['min' => 65], 'description' => 'Ages 65+'],
                ],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Member Subscription', 'billing_frequency' => 'monthly'],
                    ['source_type' => 'insurance_claim', 'name' => 'Medicare AWV', 'billing_frequency' => 'annual', 'cpt_code' => 'G0438'],
                    ['source_type' => 'insurance_claim', 'name' => 'Medicare CCM', 'billing_frequency' => 'monthly', 'cpt_code' => '99490'],
                ],
            ],
            [
                'name' => 'Behavioral Health Integration (BHI)',
                'code' => 'bhi',
                'type' => 'insurance_billed',
                'description' => 'CMS-reimbursable behavioral health integration for primary care practices managing mild-moderate behavioral health conditions. Billed via CPT 99484.',
                'duration_type' => 'ongoing',
                'specialties' => ['primary_care', 'family_medicine', 'internal_medicine', 'ob_gyn', 'pediatrics'],
                'default_plans' => [
                    ['name' => 'BHI Standard', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Insurance Billed',
                     'entitlements' => ['care_coordination_minutes' => 20, 'behavioral_assessment' => true, 'care_plan' => true, 'medication_management' => true, 'screening_tools' => true, 'telehealth' => true]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'diagnosis', 'operator' => 'in', 'value' => ['F32', 'F33', 'F41', 'F43', 'F90'], 'description' => 'Behavioral health diagnosis (depression, anxiety, PTSD, ADHD)'],
                    ['rule_type' => 'insurance_type', 'operator' => 'in', 'value' => ['medicare', 'medicare_advantage', 'commercial'], 'description' => 'Medicare or commercial insurance'],
                ],
                'default_funding' => [
                    ['source_type' => 'insurance_claim', 'name' => 'BHI Monthly', 'billing_frequency' => 'monthly', 'cpt_code' => '99484'],
                ],
            ],
            [
                'name' => 'Hypertension Management',
                'code' => 'hypertension',
                'type' => 'hybrid',
                'description' => 'Structured blood pressure management program with home monitoring, medication optimization, lifestyle coaching, and regular follow-up. Pairs with RPM for remote BP monitoring.',
                'duration_type' => 'ongoing',
                'specialties' => ['primary_care', 'internal_medicine', 'cardiology', 'family_medicine', 'geriatrics'],
                'default_plans' => [
                    ['name' => 'BP Management', 'monthly_price' => 99, 'annual_price' => 1069, 'badge_text' => null,
                     'entitlements' => ['visits_per_month' => 1, 'telehealth' => true, 'messaging' => true, 'bp_monitoring' => true, 'medication_management' => true, 'lifestyle_coaching' => true, 'monthly_review' => true]],
                    ['name' => 'BP Management + RPM', 'monthly_price' => 0, 'annual_price' => 0, 'badge_text' => 'Insurance Billed',
                     'entitlements' => ['visits_per_month' => 1, 'telehealth' => true, 'messaging' => true, 'bp_monitoring' => true, 'rpm_device' => true, 'daily_readings' => true, 'medication_management' => true, 'lifestyle_coaching' => true, 'alert_thresholds' => true, 'care_coordination_minutes' => 20]],
                ],
                'default_eligibility' => [
                    ['rule_type' => 'diagnosis', 'operator' => 'in', 'value' => ['I10', 'I11', 'I12', 'I13', 'I15'], 'description' => 'Hypertension diagnosis'],
                ],
                'default_funding' => [
                    ['source_type' => 'stripe_subscription', 'name' => 'Member Subscription', 'billing_frequency' => 'monthly'],
                    ['source_type' => 'insurance_claim', 'name' => 'RPM Billing', 'billing_frequency' => 'monthly', 'cpt_code' => '99454'],
                    ['source_type' => 'insurance_claim', 'name' => 'CCM Billing', 'billing_frequency' => 'monthly', 'cpt_code' => '99490'],
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
