<?php

namespace Database\Seeders;

use App\Models\EntitlementType;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds the platform-default entitlement type catalog.
 *
 * Every row here is system-owned: tenant_id IS NULL, is_system=true.
 * Practices browse this catalog and either pick a row directly into a
 * plan_entitlement, or fork it (creates a tenant-scoped editable copy).
 *
 * Idempotent — runs `firstOrCreate` keyed on (code) where tenant_id IS
 * NULL, so re-seeding is safe and doesn't duplicate. Existing tenant
 * custom rows (where tenant_id IS NOT NULL) are NEVER touched.
 *
 * Categories (9):
 *   visits / communication / procedures / labs_imaging / wellness /
 *   chronic_care / pharmacy / perks / internal
 *
 * Unit types (4) — covers ~95% of DPC entitlement shapes:
 *   count            "4 visits/month"
 *   time_minutes     "30 minutes of CCM"
 *   dollar_credit    "$50 dispensary credit"
 *   boolean_access   "Concierge after-hours: yes"
 *
 * Cash values are rough national-average self-pay rates so plans can
 * surface "savings vs. self-pay" without practices having to guess.
 * Practices that want their own pricing fork the row.
 */
class EntitlementTypeCatalogSeeder extends Seeder
{
    public function run(): void
    {
        // Entries shaped: [code, name, category, unit, cash, description, visibility?]
        // visibility defaults to 'everyone' when omitted.
        $catalog = [
            // ─── A. Visits / encounters ────────────────────────────
            ['office_visit',           'Office Visit',                 'visits', 'count', 150, 'Standard in-person visit with your provider.'],
            ['telehealth_visit',       'Telehealth Visit',             'visits', 'count', 120, 'Video visit with your provider.'],
            ['annual_wellness_exam',   'Annual Wellness Exam',         'visits', 'count', 250, 'Comprehensive yearly preventive visit.'],
            ['new_patient_consult',    'New Patient Consultation',     'visits', 'count', 300, 'Initial 60-minute intake visit for new members.'],
            ['sick_visit',             'Sick Visit',                   'visits', 'count', 130, 'Same-day acute care visit.'],
            ['follow_up_visit',        'Follow-up Visit',              'visits', 'count', 110, 'Brief follow-up to review labs, meds, or progress.'],
            ['same_day_visit',         'Same-Day Visit',               'visits', 'count', 175, 'Guaranteed same-day appointment.'],
            ['after_hours_visit',      'After-Hours Visit',            'visits', 'count', 200, 'Evening or weekend visit by appointment.'],
            ['home_visit',             'Home Visit',                   'visits', 'count', 350, 'Provider visits the patient at home.'],
            ['group_visit',            'Group Medical Visit',          'visits', 'count',  85, 'Shared visit with other members on similar conditions.'],
            ['pre_op_clearance',       'Pre-Op Clearance',             'visits', 'count', 200, 'Surgical clearance evaluation.'],
            ['sports_physical',        'Sports / Camp Physical',       'visits', 'count',  75, 'School, camp, or sports clearance physical.'],

            // ─── B. Communication / non-visit care ─────────────────
            ['secure_messaging',       'Secure Messaging',             'communication', 'count',  25, 'Direct portal messages to your provider.'],
            ['phone_consult',          'Phone Consult',                'communication', 'count',  60, 'Brief phone consult, no appointment needed.'],
            ['portal_qa',              'Patient Portal Q&A',           'communication', 'count',  20, 'Asynchronous question through the portal.'],
            ['care_coordination',      'Care Coordination',            'communication', 'count',  90, 'Provider coordinates with specialists or other care teams on your behalf.'],
            ['family_consult',         'Family Member Consult',        'communication', 'count',  60, 'Conversation with a family caregiver about your care plan.'],
            ['interpreter_visit',      'Translator-Assisted Visit',    'communication', 'count',  30, 'Visit with an interpreter present.'],

            // ─── C. In-office procedures ───────────────────────────
            ['ekg_in_office',          'EKG (in-office)',              'procedures', 'count',  85, 'Resting electrocardiogram performed in-office.'],
            ['spirometry',             'Spirometry',                   'procedures', 'count',  95, 'Lung-function breathing test.'],
            ['joint_injection',        'Joint Injection',              'procedures', 'count', 175, 'Cortisone or hyaluronic acid injection.'],
            ['trigger_point_injection','Trigger Point Injection',      'procedures', 'count', 125, 'Muscular trigger-point injection for pain relief.'],
            ['skin_biopsy',            'Skin Biopsy',                  'procedures', 'count', 150, 'Punch / shave biopsy of a skin lesion.'],
            ['cryotherapy',            'Cryotherapy / Wart Removal',   'procedures', 'count',  85, 'Liquid-nitrogen freeze-off for warts or skin tags.'],
            ['cerumen_removal',        'Earwax Removal',               'procedures', 'count',  65, 'Manual or irrigation cerumen removal.'],
            ['wound_care',             'Wound Care',                   'procedures', 'count',  95, 'Dressing change, debridement, or wound assessment.'],
            ['suture_removal',         'Suture Removal',               'procedures', 'count',  45, 'Removal of stitches from a prior procedure.'],
            ['iv_hydration',           'IV Hydration',                 'procedures', 'count', 125, 'Saline IV drip with optional vitamins.'],

            // ─── D. Labs & imaging ─────────────────────────────────
            ['in_house_labs',          'In-House Lab Panel',           'labs_imaging', 'count',  50, 'Basic in-office lab panel (CBC, BMP, lipid).'],
            ['send_out_labs',          'Send-Out Lab Credit',          'labs_imaging', 'dollar_credit', 100, 'Wholesale-cost credit toward outside lab orders.'],
            ['rapid_strep',            'Rapid Strep Test',             'labs_imaging', 'count',  35, 'In-office rapid throat swab for strep.'],
            ['rapid_flu',              'Rapid Flu Test',               'labs_imaging', 'count',  35, 'In-office rapid flu test.'],
            ['covid_test',             'COVID-19 Test',                'labs_imaging', 'count',  45, 'In-office rapid antigen or PCR.'],
            ['urinalysis',             'Urinalysis',                   'labs_imaging', 'count',  30, 'In-office urine dipstick or microscopy.'],
            ['pregnancy_test',         'Pregnancy Test',               'labs_imaging', 'count',  25, 'In-office urine pregnancy test.'],
            ['xray_basic',             'X-Ray (basic)',                'labs_imaging', 'count', 125, 'Single-view X-ray on referral or in-office equipment.'],

            // ─── E. Wellness & preventive ──────────────────────────
            ['dot_physical',           'DOT / CDL Physical',           'wellness', 'count', 100, 'Department of Transportation commercial-driver physical.'],
            ['pre_employment_physical','Pre-Employment Physical',      'wellness', 'count',  90, 'Employer-required physical exam.'],
            ['health_coaching',        'Health Coaching Session',      'wellness', 'count',  85, '30-minute lifestyle / behavior-change coaching session.'],
            ['nutrition_consult',      'Nutrition Consultation',       'wellness', 'count', 110, 'Personalized nutrition plan with a coach or RD.'],
            ['fitness_assessment',     'Fitness Assessment',           'wellness', 'count',  95, 'Baseline fitness + mobility evaluation.'],
            ['stress_management',      'Stress Management Session',    'wellness', 'count',  80, 'Mindfulness, breathing, or stress-management coaching.'],
            ['smoking_cessation',      'Smoking Cessation Visit',      'wellness', 'count',  75, 'Tobacco-cessation counseling visit.'],
            ['sleep_consult',          'Sleep Health Consult',         'wellness', 'count',  90, 'Sleep evaluation + behavioral guidance.'],

            // ─── F. Chronic care management ────────────────────────
            ['ccm_minutes',            'Chronic Care Management Time', 'chronic_care', 'time_minutes', 60, 'CCM minutes per month for eligible chronic conditions (CMS 99490 model).'],
            ['rpm_setup',              'RPM Device Setup',             'chronic_care', 'count', 100, 'One-time setup of a remote-patient-monitoring device.'],
            ['rpm_monthly',            'RPM Monthly Monitoring',       'chronic_care', 'count',  75, 'Monthly review of RPM data.'],
            ['diabetes_management',    'Diabetes Management Visit',    'chronic_care', 'count', 120, 'Focused diabetes review with med-titration.'],
            ['bp_management',          'Blood Pressure Management',    'chronic_care', 'count', 100, 'Hypertension review + med adjustment.'],
            ['bhi_minutes',            'Behavioral Health Integration','chronic_care', 'time_minutes', 60, 'BHI minutes per month for behavioral-health-integrated care.'],

            // ─── G. Pharmacy / dispensary ──────────────────────────
            ['dispensary_credit',      'In-House Dispensary Credit',   'pharmacy', 'dollar_credit',  50, 'Credit toward in-house dispensary medications.'],
            ['generic_rx_fill',        'Generic Rx Fill',              'pharmacy', 'count',  15, 'Wholesale-cost generic medication fill.'],
            ['compounded_med',         'Compounded Medication',        'pharmacy', 'count',  35, 'Custom-compounded prescription.'],
            ['refill_request',         'Refill Request',               'pharmacy', 'count',   0, 'Standard refill request — usually free for members.'],
            ['vaccine_admin',          'Vaccine Administration',       'pharmacy', 'count',  35, 'In-office vaccine administration (vaccine cost separate).'],

            // ─── H. Behavioral / mental health ─────────────────────
            ['psych_eval',             'Initial Psychiatric Evaluation','perks', 'count', 350, '60-minute initial psychiatric evaluation.'],
            ['med_management',         'Medication Management Visit',  'perks', 'count', 175, 'Psychiatric medication management visit.'],
            ['therapy_session_45',     'Therapy Session (45 min)',     'perks', 'count', 150, 'Standard 45-minute therapy session.'],
            ['therapy_brief_20',       'Therapy Check-in (20 min)',    'perks', 'count',  85, 'Brief therapy check-in or follow-up.'],
            ['crisis_intervention',    'Crisis Intervention Visit',    'perks', 'count', 250, 'Same-day crisis intervention visit.'],
            ['substance_use_screen',   'Substance Use Screening',      'perks', 'count', 120, 'SBIRT screening + brief intervention.'],

            // ─── I. Specialty & membership perks ───────────────────
            ['concierge_after_hours',  'Concierge After-Hours Access', 'perks', 'boolean_access', 0, 'Direct after-hours line to your provider.'],
            ['travel_medicine',        'Travel Medicine Consult',      'perks', 'count', 175, 'Pre-travel risk review + immunization plan.'],
            ['functional_medicine',    'Functional Medicine Consult',  'perks', 'count', 250, 'Root-cause functional medicine evaluation.'],
            ['hormone_therapy',        'Hormone Therapy Visit',        'perks', 'count', 175, 'Hormone-replacement therapy visit + monitoring.'],
            ['weight_loss_visit',      'Weight Loss Program Visit',    'perks', 'count', 150, 'Visit within a structured weight-loss program.'],
            ['aesthetic_consult',      'Aesthetic Consultation',       'perks', 'count', 100, 'Cosmetic / aesthetic medicine consult.'],

            // ─── J. Internal / admin-only — not visible to patients ─
            ['supervisor_review',      'Supervisor Review Time',       'internal', 'time_minutes', 120, 'Supervising-provider review minutes for billable CCM/RPM.', 'admin_only'],
            ['provider_documentation', 'Provider Documentation Time',  'internal', 'time_minutes',  60, 'Time spent on chart documentation outside the visit.', 'admin_only'],
            ['compliance_audit',       'Compliance Audit Allowance',   'internal', 'count', 0, 'Reserved allotment for compliance audits.', 'admin_only'],
            ['staff_training',         'Staff Training Visit',         'internal', 'count', 0, 'Internal training visit, not billable.', 'admin_only'],
        ];

        $sortOrder = 0;
        foreach ($catalog as $row) {
            $sortOrder += 10;
            $code = $row[0];
            $payload = [
                // Required attrs on first-create. We do NOT update name /
                // cash_value etc. on re-run because a superadmin may have
                // tweaked the system row out-of-band.
                'name' => $row[1],
                'category' => $row[2],
                'unit_of_measure' => $row[3],
                'cash_value' => $row[4],
                'description' => $row[5],
                'visibility' => $row[6] ?? 'everyone',
                'is_system' => true,
                'is_active' => true,
                'trackable' => true,
                'sort_order' => $sortOrder,
            ];

            // Idempotent: tenant_id IS NULL + code = catalog key. Re-runs
            // become no-ops if the row already exists.
            $existing = EntitlementType::query()
                ->whereNull('tenant_id')
                ->where('code', $code)
                ->first();

            if ($existing) {
                // Update only sort_order so the catalog stays in the order
                // we ship. Don't touch name/cash/description because
                // superadmin may have edited the live row.
                if ($existing->sort_order !== $sortOrder) {
                    $existing->update(['sort_order' => $sortOrder]);
                }
                continue;
            }

            EntitlementType::create(array_merge(['code' => $code, 'tenant_id' => null], $payload));
        }
    }
}
