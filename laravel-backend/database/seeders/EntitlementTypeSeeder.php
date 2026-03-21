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
        $types = [
            [
                'code' => 'office_visit',
                'name' => 'Office Visit',
                'category' => 'visit',
                'description' => 'In-person office visit with provider.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 150.00,
                'sort_order' => 1,
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
            ],
            [
                'code' => 'same_day_visit',
                'name' => 'Same-Day / Urgent Visit',
                'category' => 'visit',
                'description' => 'Same-day urgent care visit.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 200.00,
                'sort_order' => 3,
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
            ],
            [
                'code' => 'secure_messaging',
                'name' => 'Secure Messaging',
                'category' => 'communication',
                'description' => 'Unlimited secure messaging with care team.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 5,
            ],
            [
                'code' => 'phone_access',
                'name' => 'Phone / Text Access',
                'category' => 'communication',
                'description' => 'Direct phone and text access to provider.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 6,
            ],
            [
                'code' => 'basic_lab_panel',
                'name' => 'Basic Lab Panel',
                'category' => 'lab',
                'description' => 'Basic labs including CBC, CMP, lipids, A1C, TSH.',
                'unit_of_measure' => 'panel',
                'trackable' => true,
                'cash_value' => 85.00,
                'sort_order' => 7,
            ],
            [
                'code' => 'advanced_lab',
                'name' => 'Advanced Lab Panel',
                'category' => 'lab',
                'description' => 'Advanced or specialty laboratory testing.',
                'unit_of_measure' => 'panel',
                'trackable' => true,
                'cash_value' => 150.00,
                'sort_order' => 8,
            ],
            [
                'code' => 'rapid_test',
                'name' => 'In-Office Rapid Test',
                'category' => 'lab',
                'description' => 'Rapid in-office tests (strep, flu, UA).',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 25.00,
                'sort_order' => 9,
            ],
            [
                'code' => 'minor_procedure',
                'name' => 'Minor In-Office Procedure',
                'category' => 'procedure',
                'description' => 'Minor procedures such as skin lesion removal, joint injections, laceration repair.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => 200.00,
                'sort_order' => 10,
            ],
            [
                'code' => 'dispensed_medication',
                'name' => 'Dispensed Medication',
                'category' => 'rx',
                'description' => 'Medications dispensed at the practice.',
                'unit_of_measure' => 'item',
                'trackable' => true,
                'cash_value' => null,
                'sort_order' => 11,
            ],
            [
                'code' => 'annual_wellness',
                'name' => 'Annual Wellness Exam',
                'category' => 'visit',
                'description' => 'Comprehensive annual wellness and preventive visit.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 250.00,
                'sort_order' => 12,
            ],
            [
                'code' => 'care_coordination',
                'name' => 'Care Coordination',
                'category' => 'access',
                'description' => 'Care coordination and specialist referral management.',
                'unit_of_measure' => 'access',
                'trackable' => false,
                'cash_value' => null,
                'sort_order' => 13,
            ],
            [
                'code' => 'mental_health_visit',
                'name' => 'Mental Health Visit',
                'category' => 'visit',
                'description' => 'Mental/behavioral health consultation.',
                'unit_of_measure' => 'visit',
                'trackable' => true,
                'cash_value' => 150.00,
                'sort_order' => 14,
            ],
            [
                'code' => 'chronic_care_mgmt',
                'name' => 'Chronic Care Management',
                'category' => 'program',
                'description' => 'Ongoing chronic care management program.',
                'unit_of_measure' => 'session',
                'trackable' => true,
                'cash_value' => 100.00,
                'sort_order' => 15,
            ],
        ];

        // Seed for every practice that exists
        $practices = Practice::all();

        if ($practices->isEmpty()) {
            $this->command->warn('No practices found — entitlement types will be seeded when practices are created.');
            return;
        }

        foreach ($practices as $practice) {
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
                } catch (\Throwable $e) {
                    Log::warning("Failed to seed entitlement type {$type['code']} for practice {$practice->id}: " . $e->getMessage());
                }
            }

            $this->command->info("Seeded " . count($types) . " entitlement types for practice: {$practice->id}");
        }
    }
}
