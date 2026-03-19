<?php

namespace App\Services;

use App\Models\AppointmentType;
use App\Models\ConsentTemplate;
use App\Models\MasterSpecialty;
use App\Models\MembershipPlan;
use App\Models\PlanAddon;
use App\Models\PracticeSetting;
use App\Models\Practice;
use App\Models\ScreeningTemplate;

class PracticeBootstrapService
{
    /**
     * Bootstrap a newly registered practice with default data
     * based on their selected specialty.
     */
    public function bootstrap(Practice $practice): void
    {
        $specialty = MasterSpecialty::where('code', $practice->specialty)->first();

        if (!$specialty) {
            // Fallback: still copy universal consents and create default settings
            $this->copyConsentTemplates($practice);
            $this->createDefaultSettings($practice);
            return;
        }

        $this->createDefaultPlans($practice, $specialty);
        $this->createDefaultAppointmentTypes($practice, $specialty);
        $this->copyScreeningTemplates($practice, $specialty);
        $this->copyConsentTemplates($practice);
        $this->createDefaultSettings($practice);
    }

    /**
     * Create default membership plans from the specialty's plan templates.
     */
    protected function createDefaultPlans(Practice $practice, MasterSpecialty $specialty): void
    {
        $planTemplates = $specialty->default_plan_templates ?? [];

        foreach ($planTemplates as $index => $template) {
            $plan = MembershipPlan::updateOrCreate(
                [
                    'tenant_id' => $practice->id,
                    'name' => $template['name'],
                ],
                [
                    'monthly_price' => $template['monthly_price'],
                    'annual_price' => $template['annual_price'] ?? null,
                    'visits_per_month' => $template['visits_per_month'],
                    'telehealth_included' => $template['telehealth_included'] ?? true,
                    'messaging_included' => $template['messaging_included'] ?? true,
                    'messaging_response_sla_hours' => $template['messaging_response_sla_hours'] ?? 24,
                    'crisis_support' => $template['crisis_support'] ?? false,
                    'badge_text' => $template['badge_text'] ?? null,
                    'sort_order' => $index + 1,
                    'is_active' => true,
                ]
            );

            // Create add-ons and link to the first plan (or the plan with matching index)
            if ($index === 0) {
                $this->createDefaultAddons($practice, $plan, $specialty);
            }
        }
    }

    /**
     * Create default add-ons linked to a plan.
     */
    protected function createDefaultAddons(Practice $practice, MembershipPlan $plan, MasterSpecialty $specialty): void
    {
        $addons = $specialty->default_addons ?? [];

        foreach ($addons as $addon) {
            PlanAddon::updateOrCreate(
                [
                    'tenant_id' => $practice->id,
                    'plan_id' => $plan->id,
                    'name' => $addon['name'],
                ],
                [
                    'price' => $addon['price'],
                    'billing_type' => $addon['billing_type'],
                    'is_active' => true,
                ]
            );
        }
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
