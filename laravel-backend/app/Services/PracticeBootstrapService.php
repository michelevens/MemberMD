<?php

namespace App\Services;

use App\Models\AppointmentType;
use App\Models\ConsentTemplate;
use App\Models\MasterSpecialty;
use App\Models\PracticeSetting;
use App\Models\Practice;
use App\Models\ScreeningTemplate;
use Database\Seeders\EntitlementTypeSeeder;

class PracticeBootstrapService
{
    /**
     * Bootstrap a newly registered practice with default data
     * based on their selected specialty.
     */
    public function bootstrap(Practice $practice): void
    {
        // Practice.specialty can hold either the master code (e.g.
        // "psychiatry") or the display name (e.g. "Psychiatry") — the
        // registration form passes the display label and the seeder
        // historically did too. Try both so screening / consent
        // templates always copy correctly.
        $specialty = MasterSpecialty::where('code', $practice->specialty)
            ->orWhere('name', $practice->specialty)
            ->first();

        if (!$specialty) {
            // Fallback: still seed entitlements, copy universal consents and create default settings
            $this->seedEntitlementTypes($practice);
            $this->copyConsentTemplates($practice);
            $this->createDefaultSettings($practice);
            return;
        }

        // Plans are intentionally NOT auto-seeded. Each practice owns its own
        // pricing under the two-tier billing model and creates plans from the
        // Practice Portal. Specialty default_plan_templates remain in the DB
        // as a future opt-in "starter pack" the practice can apply manually.
        $this->createDefaultAppointmentTypes($practice, $specialty);
        $this->seedEntitlementTypes($practice);
        $this->copyScreeningTemplates($practice, $specialty);
        $this->copyConsentTemplates($practice);
        $this->createDefaultSettings($practice);
    }

    /**
     * Create default appointment types from the specialty configuration.
     */
    protected function createDefaultAppointmentTypes(Practice $practice, MasterSpecialty $specialty): void
    {
        $appointmentTypes = $specialty->default_appointment_types ?? [];

        foreach ($appointmentTypes as $index => $type) {
            AppointmentType::updateOrCreate(
                [
                    'tenant_id' => $practice->id,
                    'name' => $type['name'],
                ],
                [
                    'duration_minutes' => $type['duration_minutes'],
                    'is_telehealth' => $type['is_telehealth'] ?? false,
                    'sort_order' => $index + 1,
                    'is_active' => true,
                ]
            );
        }
    }

    /**
     * Copy system-wide screening templates relevant to the specialty.
     */
    protected function copyScreeningTemplates(Practice $practice, MasterSpecialty $specialty): void
    {
        $toolCodes = $specialty->default_screening_tools ?? [];

        if (empty($toolCodes)) {
            return;
        }

        // Get system-wide templates matching the specialty's screening tools
        $templates = ScreeningTemplate::whereNull('tenant_id')
            ->whereIn('code', $toolCodes)
            ->where('is_active', true)
            ->get();

        foreach ($templates as $template) {
            ScreeningTemplate::updateOrCreate(
                [
                    'tenant_id' => $practice->id,
                    'code' => $template->code,
                ],
                [
                    'name' => $template->name,
                    'description' => $template->description,
                    'specialty' => $template->specialty,
                    'questions' => $template->questions,
                    'scoring_ranges' => $template->scoring_ranges,
                    'is_active' => true,
                ]
            );
        }
    }

    /**
     * Copy all system-wide consent templates to the practice.
     * Filters by specialty: copies universal (null specialty) + specialty-specific.
     */
    protected function copyConsentTemplates(Practice $practice): void
    {
        $templates = ConsentTemplate::whereNull('tenant_id')
            ->where('is_active', true)
            ->where(function ($query) use ($practice) {
                $query->whereNull('specialty')
                      ->orWhere('specialty', $practice->specialty);
            })
            ->get();

        foreach ($templates as $template) {
            ConsentTemplate::updateOrCreate(
                [
                    'tenant_id' => $practice->id,
                    'type' => $template->type,
                ],
                [
                    'name' => $template->name,
                    'specialty' => $template->specialty,
                    'is_required' => $template->is_required,
                    'version' => $template->version,
                    'content' => $template->content,
                    'is_active' => true,
                ]
            );
        }
    }

    /**
     * Seed entitlement types for the practice, filtered by practice_model.
     * Maps practice_model to the appropriate program type for filtering.
     */
    protected function seedEntitlementTypes(Practice $practice): void
    {
        // Map practice_model to the program type tag used in applicable_programs
        $programType = $practice->practice_model ?? null;

        EntitlementTypeSeeder::seedForPractice($practice, null, $programType);
    }

    /**
     * Create default practice settings (office hours, policies, etc.).
     */
    protected function createDefaultSettings(Practice $practice): void
    {
        $defaults = [
            'office_hours' => json_encode([
                'monday' => ['start' => '09:00', 'end' => '17:00', 'open' => true],
                'tuesday' => ['start' => '09:00', 'end' => '17:00', 'open' => true],
                'wednesday' => ['start' => '09:00', 'end' => '17:00', 'open' => true],
                'thursday' => ['start' => '09:00', 'end' => '17:00', 'open' => true],
                'friday' => ['start' => '09:00', 'end' => '17:00', 'open' => true],
                'saturday' => ['start' => null, 'end' => null, 'open' => false],
                'sunday' => ['start' => null, 'end' => null, 'open' => false],
            ]),
            'timezone' => 'America/New_York',
            'cancellation_policy_hours' => '24',
            'no_show_fee' => '50.00',
            'booking_window_days' => '60',
            'min_booking_notice_hours' => '2',
            'appointment_reminders_enabled' => 'true',
            'reminder_hours_before' => '24',
            'auto_confirm_appointments' => 'false',
            'allow_online_booking' => 'true',
            'new_patient_message' => 'Welcome to our practice! Please complete your intake forms before your first appointment.',
        ];

        foreach ($defaults as $key => $value) {
            PracticeSetting::updateOrCreate(
                [
                    'practice_id' => $practice->id,
                    'key' => $key,
                ],
                [
                    'value' => $value,
                ]
            );
        }
    }
}
