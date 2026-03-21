<?php

namespace Database\Seeders;

use App\Models\EntitlementType;
use App\Models\Practice;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;

class EntitlementTypeSeeder extends Seeder
{
    public function run(): void
    {
        $types = self::getEntitlementTypes();

        // Seed for every practice that exists
        $practices = Practice::all();

        if ($practices->isEmpty()) {
            $this->command->warn('No practices found — entitlement types will be seeded when practices are created.');
            return;
        }

        foreach ($practices as $practice) {
            self::seedForPractice($practice, $types);
            $this->command->info("Seeded " . count($types) . " entitlement types for practice: {$practice->id}");
        }
    }

    /**
     * Seed entitlement types for a single practice.
     * Optionally filter by practice_model (program type).
     */
    public static function seedForPractice(Practice $practice, ?array $types = null, ?string $programType = null): int
    {
        $types = $types ?? self::getEntitlementTypes();

        // Filter by program type if provided
        if ($programType) {
            $types = array_filter($types, function ($type) use ($programType) {
                return $type['applicable_programs'] === null
                    || in_array($programType, $type['applicable_programs']);
            });
        }

        $count = 0;

        foreach ($types as $type) {
            try {
                EntitlementType::updateOrCreate(
                    [
                        'tenant_id' => $practice->id,
                        'code' => $type['code'],
                    ],
                    array_merge($type, [
                        'tenant_id' => $practice->id,
                        'is_active' => true,
                    ])
                );
                $count++;
            } catch (\Throwable $e) {
                Log::warning("Failed to seed entitlement type {$type['code']} for practice {$practice->id}: " . $e->getMessage());
            }
        }

        return $count;
    }

    /**
     * Return the full catalog of ~43 entitlement types organized by category.
     */
    public static function getEntitlementTypes(): array
    {
        return [
            // =====================================================================
            // Category: Visits (10 types)
            // =====================================================================
            [
                'code' => 'office_visit',
                'name' => 'Office Visit',
                'category' => 'visit',
                'description' => 'In-person office visit with provider.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 150.00,
                'sort_order' => 1,
                'applicable_programs' => null, // all programs
            ],
            [
                'code' => 'telehealth_visit',
                'name' => 'Telehealth Visit',
                'category' => 'visit',
                'description' => 'Video or phone telehealth consultation.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 75.00,
                'sort_order' => 2,
                'applicable_programs' => null,
            ],
            [
                'code' => 'same_day_visit',
                'name' => 'Same-Day/Urgent Visit',
                'category' => 'visit',
                'description' => 'Same-day urgent care visit.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 200.00,
                'sort_order' => 3,
                'applicable_programs' => null,
            ],
            [
                'code' => 'after_hours_visit',
                'name' => 'After-Hours Visit',
                'category' => 'visit',
                'description' => 'Visit outside of normal business hours.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 250.00,
                'sort_order' => 4,
                'applicable_programs' => ['concierge', 'pure_dpc'],
            ],
            [
                'code' => 'home_visit',
                'name' => 'Home Visit',
                'category' => 'visit',
                'description' => 'Provider visit at patient home.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 300.00,
                'sort_order' => 5,
                'applicable_programs' => ['concierge'],
            ],
            [
                'code' => 'mental_health_visit',
                'name' => 'Mental Health Visit',
                'category' => 'visit',
                'description' => 'Mental/behavioral health consultation.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 150.00,
                'sort_order' => 6,
                'applicable_programs' => ['behavioral_health', 'pure_dpc', 'hybrid_dpc'],
            ],
            [
                'code' => 'group_visit',
                'name' => 'Group Visit/Class',
                'category' => 'visit',
                'description' => 'Group visit or educational class session.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 50.00,
                'sort_order' => 7,
                'applicable_programs' => ['pure_dpc', 'hybrid_dpc'],
            ],
            [
                'code' => 'annual_wellness',
                'name' => 'Annual Wellness Exam',
                'category' => 'visit',
                'description' => 'Comprehensive annual wellness and preventive visit.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 250.00,
                'sort_order' => 8,
                'applicable_programs' => null,
            ],
            [
                'code' => 'specialist_referral_coord',
                'name' => 'Specialist Referral Coordination',
                'category' => 'visit',
                'description' => 'Coordination and facilitation of specialist referrals.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 75.00,
                'sort_order' => 9,
                'applicable_programs' => null,
            ],
            [
                'code' => 'walk_in_visit',
                'name' => 'Walk-In Visit',
                'category' => 'visit',
                'description' => 'Walk-in visit without prior appointment.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 125.00,
                'sort_order' => 10,
                'applicable_programs' => ['pure_dpc', 'concierge'],
            ],

            // =====================================================================
            // Category: Communication (5 types)
            // =====================================================================
            [
                'code' => 'secure_messaging',
                'name' => 'Secure Messaging',
                'category' => 'communication',
                'description' => 'Unlimited secure messaging with care team.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 11,
                'applicable_programs' => null,
            ],
            [
                'code' => 'phone_text_access',
                'name' => 'Phone/Text Access',
                'category' => 'communication',
                'description' => 'Direct phone and text access to provider.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 12,
                'applicable_programs' => null,
            ],
            [
                'code' => 'email_access',
                'name' => 'Direct Email Access',
                'category' => 'communication',
                'description' => 'Direct email access to provider for non-urgent inquiries.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 13,
                'applicable_programs' => null,
            ],
            [
                'code' => 'care_coordination',
                'name' => 'Care Coordination',
                'category' => 'communication',
                'description' => 'Care coordination and specialist referral management.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 14,
                'applicable_programs' => null,
            ],
            [
                'code' => 'after_hours_oncall',
                'name' => 'After-Hours On-Call Access',
                'category' => 'communication',
                'description' => 'After-hours on-call access for urgent matters.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 15,
                'applicable_programs' => ['concierge', 'pure_dpc'],
            ],

            // =====================================================================
            // Category: Labs & Diagnostics (7 types)
            // =====================================================================
            [
                'code' => 'basic_lab_panel',
                'name' => 'Basic Lab Panel (CBC/CMP/Lipid/TSH/A1C)',
                'category' => 'lab',
                'description' => 'Basic labs including CBC, CMP, lipids, A1C, TSH.',
                'unit_of_measure' => 'panel',
                'trackable' => true,
                'cash_value' => 85.00,
                'sort_order' => 16,
                'applicable_programs' => null,
            ],
            [
                'code' => 'advanced_lab_panel',
                'name' => 'Advanced Lab Panel',
                'category' => 'lab',
                'description' => 'Advanced or specialty laboratory testing.',
                'unit_of_measure' => 'panel',
                'trackable' => true,
                'cash_value' => 150.00,
                'sort_order' => 17,
                'applicable_programs' => ['pure_dpc', 'hybrid_dpc', 'concierge'],
            ],
            [
                'code' => 'rapid_test',
                'name' => 'Rapid Test (Strep/Flu/COVID/UA)',
                'category' => 'lab',
                'description' => 'Rapid in-office tests (strep, flu, COVID, UA).',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 25.00,
                'sort_order' => 18,
                'applicable_programs' => null,
            ],
            [
                'code' => 'in_office_blood_draw',
                'name' => 'In-Office Blood Draw/Phlebotomy',
                'category' => 'lab',
                'description' => 'In-office blood draw and phlebotomy service.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 25.00,
                'sort_order' => 19,
                'applicable_programs' => null,
            ],
            [
                'code' => 'imaging_coordination',
                'name' => 'Imaging Coordination & Discount',
                'category' => 'lab',
                'description' => 'Coordination of imaging services with negotiated discounts.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 50.00,
                'sort_order' => 20,
                'applicable_programs' => null,
            ],
            [
                'code' => 'point_of_care_test',
                'name' => 'Point-of-Care Testing (glucose, INR)',
                'category' => 'lab',
                'description' => 'Point-of-care testing such as glucose and INR monitoring.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 15.00,
                'sort_order' => 21,
                'applicable_programs' => ['pure_dpc', 'hybrid_dpc'],
            ],
            [
                'code' => 'pathology_coordination',
                'name' => 'Pathology Coordination',
                'category' => 'lab',
                'description' => 'Coordination of pathology services and results.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 75.00,
                'sort_order' => 22,
                'applicable_programs' => ['pure_dpc', 'hybrid_dpc'],
            ],

            // =====================================================================
            // Category: Procedures (8 types)
            // =====================================================================
            [
                'code' => 'minor_procedure',
                'name' => 'Minor In-Office Procedure',
                'category' => 'procedure',
                'description' => 'Minor in-office procedures (biopsies, I&D, etc.).',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 200.00,
                'sort_order' => 23,
                'applicable_programs' => null,
            ],
            [
                'code' => 'skin_lesion_removal',
                'name' => 'Skin Lesion/Tag Removal',
                'category' => 'procedure',
                'description' => 'Removal of skin lesions, tags, and benign growths.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 175.00,
                'sort_order' => 24,
                'applicable_programs' => ['pure_dpc', 'concierge'],
            ],
            [
                'code' => 'joint_injection',
                'name' => 'Joint Injection (steroid/HA)',
                'category' => 'procedure',
                'description' => 'Joint injection with corticosteroid or hyaluronic acid.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 250.00,
                'sort_order' => 25,
                'applicable_programs' => ['pure_dpc', 'concierge'],
            ],
            [
                'code' => 'laceration_repair',
                'name' => 'Laceration Repair/Suturing',
                'category' => 'procedure',
                'description' => 'Laceration repair and suturing.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 200.00,
                'sort_order' => 26,
                'applicable_programs' => null,
            ],
            [
                'code' => 'ekg',
                'name' => 'EKG/Electrocardiogram',
                'category' => 'procedure',
                'description' => 'In-office EKG/electrocardiogram.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 75.00,
                'sort_order' => 27,
                'applicable_programs' => null,
            ],
            [
                'code' => 'spirometry',
                'name' => 'Spirometry/Pulmonary Function',
                'category' => 'procedure',
                'description' => 'Spirometry and pulmonary function testing.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 100.00,
                'sort_order' => 28,
                'applicable_programs' => ['pure_dpc', 'hybrid_dpc'],
            ],
            [
                'code' => 'ear_lavage',
                'name' => 'Ear Lavage/Cerumen Removal',
                'category' => 'procedure',
                'description' => 'Ear lavage and cerumen (earwax) removal.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 75.00,
                'sort_order' => 29,
                'applicable_programs' => null,
            ],
            [
                'code' => 'cryotherapy',
                'name' => 'Cryotherapy (wart/lesion removal)',
                'category' => 'procedure',
                'description' => 'Cryotherapy for wart and lesion removal.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 100.00,
                'sort_order' => 30,
                'applicable_programs' => ['pure_dpc', 'concierge'],
            ],

            // =====================================================================
            // Category: Prescriptions & Dispensing (5 types)
            // =====================================================================
            [
                'code' => 'dispensed_medication',
                'name' => 'Dispensed Medication (at cost)',
                'category' => 'rx',
                'description' => 'Medications dispensed at the practice at cost.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 15.00,
                'sort_order' => 31,
                'applicable_programs' => ['pure_dpc', 'hybrid_dpc'],
            ],
            [
                'code' => 'chronic_disease_meds',
                'name' => 'Chronic Disease Medications',
                'category' => 'rx',
                'description' => 'Chronic disease medications dispensed or managed by practice.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 25.00,
                'sort_order' => 32,
                'applicable_programs' => ['pure_dpc', 'ccm'],
            ],
            [
                'code' => 'acute_medications',
                'name' => 'Acute Medications',
                'category' => 'rx',
                'description' => 'Acute medications dispensed for immediate treatment.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 20.00,
                'sort_order' => 33,
                'applicable_programs' => ['pure_dpc'],
            ],
            [
                'code' => 'vaccines_immunizations',
                'name' => 'Vaccines & Immunizations',
                'category' => 'rx',
                'description' => 'Vaccines and immunizations administered at the practice.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 35.00,
                'sort_order' => 34,
                'applicable_programs' => null,
            ],
            [
                'code' => 'medication_management',
                'name' => 'Medication Management Review',
                'category' => 'rx',
                'description' => 'Comprehensive medication management and review.',
                'unit_of_measure' => 'session',
                'trackable' => true,
                'cash_value' => 50.00,
                'sort_order' => 35,
                'applicable_programs' => ['ccm', 'behavioral_health'],
            ],

            // =====================================================================
            // Category: Programs & Management (5 types)
            // =====================================================================
            [
                'code' => 'chronic_care_mgmt',
                'name' => 'Chronic Care Management (CCM)',
                'category' => 'program',
                'description' => 'Ongoing chronic care management program.',
                'unit_of_measure' => 'session',
                'trackable' => true,
                'cash_value' => 100.00,
                'sort_order' => 36,
                'applicable_programs' => ['ccm', 'pure_dpc'],
            ],
            [
                'code' => 'weight_management',
                'name' => 'Weight Management Program',
                'category' => 'program',
                'description' => 'Structured weight management and nutrition program.',
                'unit_of_measure' => 'session',
                'trackable' => true,
                'cash_value' => 75.00,
                'sort_order' => 37,
                'applicable_programs' => ['pure_dpc', 'hybrid_dpc'],
            ],
            [
                'code' => 'preventive_wellness',
                'name' => 'Preventive Wellness Program',
                'category' => 'program',
                'description' => 'Preventive wellness and health maintenance program.',
                'unit_of_measure' => 'session',
                'trackable' => true,
                'cash_value' => 50.00,
                'sort_order' => 38,
                'applicable_programs' => null,
            ],
            [
                'code' => 'behavioral_health_program',
                'name' => 'Behavioral Health Program',
                'category' => 'program',
                'description' => 'Structured behavioral health treatment program.',
                'unit_of_measure' => 'session',
                'trackable' => true,
                'cash_value' => 100.00,
                'sort_order' => 39,
                'applicable_programs' => ['behavioral_health'],
            ],
            [
                'code' => 'diabetes_management',
                'name' => 'Diabetes Management Program',
                'category' => 'program',
                'description' => 'Comprehensive diabetes management and monitoring program.',
                'unit_of_measure' => 'session',
                'trackable' => true,
                'cash_value' => 100.00,
                'sort_order' => 40,
                'applicable_programs' => ['ccm', 'pure_dpc'],
            ],

            // =====================================================================
            // Category: Access & Premium (3 types)
            // =====================================================================
            [
                'code' => 'priority_scheduling',
                'name' => 'Priority Scheduling',
                'category' => 'access',
                'description' => 'Priority appointment scheduling and reduced wait times.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 41,
                'applicable_programs' => ['concierge'],
            ],
            [
                'code' => 'extended_appointments',
                'name' => 'Extended Appointment Time (45-60 min)',
                'category' => 'access',
                'description' => 'Extended appointment duration of 45-60 minutes.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 42,
                'applicable_programs' => ['concierge'],
            ],
            [
                'code' => 'vip_concierge',
                'name' => 'VIP Concierge Access',
                'category' => 'access',
                'description' => 'VIP concierge-level access including personal health coordinator.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 43,
                'applicable_programs' => ['concierge'],
            ],
        ];
    }
}
