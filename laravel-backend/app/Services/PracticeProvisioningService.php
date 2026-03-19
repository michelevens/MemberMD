<?php

namespace App\Services;

use App\Models\Practice;
use App\Models\Program;
use App\Models\ProgramPlan;
use App\Models\ProgramFundingSource;
use App\Models\ProgramEligibilityRule;
use App\Models\ScreeningTemplate;
use App\Models\ConsentTemplate;
use App\Models\MasterSpecialty;
use App\Models\AppointmentType;
use App\Models\PracticeSetting;

class PracticeProvisioningService
{
    public function provisionPractice(Practice $practice): array
    {
        $summary = [];

        // 1. Provision programs based on selected_programs
        $summary['programs'] = $this->provisionPrograms($practice);

        // 2. Provision screening templates based on specialty
        $summary['screening_templates'] = $this->provisionScreeningTemplates($practice);

        // 3. Provision consent templates (all required ones + specialty-specific)
        $summary['consent_templates'] = $this->provisionConsentTemplates($practice);

        // 4. Provision appointment types from specialty defaults
        $summary['appointment_types'] = $this->provisionAppointmentTypes($practice);

        // 5. Provision diagnosis favorites from specialty
        $summary['diagnosis_favorites'] = $this->provisionDiagnosisFavorites($practice);

        return $summary;
    }

    protected function provisionPrograms(Practice $practice): int
    {
        $selectedCodes = $practice->selected_programs ?? [];
        $specialty = $practice->specialty;
        $count = 0;

        // Get master program templates
        $templates = Program::withoutGlobalScope('tenant')
            ->where('is_template', true)
            ->whereNull('tenant_id')
            ->get();

        foreach ($templates as $template) {
            // FILTER: Skip if not in selected programs
            if (!empty($selectedCodes) && !in_array($template->code, $selectedCodes)) {
                continue;
            }

            // FILTER: Skip if program doesn't apply to this specialty
            $programSpecialties = $template->specialties ?? [];
            if (!empty($programSpecialties) && !empty($specialty) && !in_array($specialty, $programSpecialties)) {
                continue;
            }

            // Idempotence check
            if (Program::withoutGlobalScope('tenant')
                ->where('tenant_id', $practice->id)
                ->where('code', $template->code)
                ->exists()
            ) {
                $count++;
                continue;
            }

            // Replicate program as tenant-scoped copy
            $program = $template->replicate(['id', 'is_template', 'tenant_id', 'current_enrollment']);
            $program->tenant_id = $practice->id;
            $program->is_template = false;
            $program->status = 'draft'; // Practice needs to activate
            $program->current_enrollment = 0;
            $program->save();

            // Replicate plans
            $masterPlans = ProgramPlan::where('program_id', $template->id)->get();
            foreach ($masterPlans as $masterPlan) {
                $plan = $masterPlan->replicate(['id', 'program_id', 'tenant_id']);
                $plan->program_id = $program->id;
                $plan->tenant_id = $practice->id;
                $plan->save();
            }

            // Replicate eligibility rules
            $masterRules = ProgramEligibilityRule::where('program_id', $template->id)->get();
            foreach ($masterRules as $masterRule) {
                $rule = $masterRule->replicate(['id', 'program_id']);
                $rule->program_id = $program->id;
                $rule->save();
            }

            // Replicate funding sources
            $masterSources = ProgramFundingSource::where('program_id', $template->id)->get();
            foreach ($masterSources as $masterSource) {
                $source = $masterSource->replicate(['id', 'program_id']);
                $source->program_id = $program->id;
                $source->save();
            }

            $count++;
        }

        return $count;
    }

    protected function provisionScreeningTemplates(Practice $practice): int
    {
        $specialty = $practice->specialty;
        $count = 0;

        // Get master screening templates (tenant_id=null)
        $masters = ScreeningTemplate::whereNull('tenant_id')->where('is_active', true)->get();

        foreach ($masters as $master) {
            // FILTER by specialty if the template has a specialty field
            if (!empty($master->specialty) && !empty($specialty) && $master->specialty !== $specialty) {
                // Check if specialty is in the template's applicable specialties
                $applicableSpecialties = $this->getScreeningSpecialties($master->code);
                if (!in_array($specialty, $applicableSpecialties)) {
                    continue;
                }
            }

            // Idempotence check
            if (ScreeningTemplate::where('tenant_id', $practice->id)->where('code', $master->code)->exists()) {
                $count++;
                continue;
            }

            $copy = $master->replicate(['id', 'tenant_id']);
            $copy->tenant_id = $practice->id;
            $copy->save();
            $count++;
        }

        return $count;
    }

    protected function provisionConsentTemplates(Practice $practice): int
    {
        $specialty = $practice->specialty;
        $count = 0;

        // Get master consent templates from master_consent_templates table
        $masters = \DB::table('master_consent_templates')->where('is_active', true)->get();

        foreach ($masters as $master) {
            // FILTER: Required consents go to everyone, specialty-specific only to matching
            if (!empty($master->specialty) && !empty($specialty) && $master->specialty !== $specialty) {
                continue;
            }

            // Idempotence check
            if (ConsentTemplate::where('tenant_id', $practice->id)->where('type', $master->type)->where('name', $master->name)->exists()) {
                $count++;
                continue;
            }

            ConsentTemplate::create([
                'tenant_id' => $practice->id,
                'name' => $master->name,
                'type' => $master->type,
                'content' => $master->content,
                'specialty' => $master->specialty,
                'is_required' => $master->is_required,
                'version' => $master->version,
                'is_active' => true,
            ]);
            $count++;
        }

        return $count;
    }

    protected function provisionAppointmentTypes(Practice $practice): int
    {
        $specialty = $practice->specialty;
        $count = 0;

        if (empty($specialty)) return 0;

        // Get specialty's default appointment types
        $masterSpecialty = MasterSpecialty::where('code', $specialty)->first();
        if (!$masterSpecialty || empty($masterSpecialty->default_appointment_types)) return 0;

        foreach ($masterSpecialty->default_appointment_types as $i => $aptType) {
            $name = $aptType['name'] ?? 'Follow-Up';

            // Idempotence check
            if (AppointmentType::where('tenant_id', $practice->id)->where('name', $name)->exists()) {
                $count++;
                continue;
            }

            AppointmentType::create([
                'tenant_id' => $practice->id,
                'name' => $name,
                'duration_minutes' => $aptType['duration_minutes'] ?? 30,
                'is_telehealth' => $aptType['is_telehealth'] ?? false,
                'sort_order' => $i,
                'is_active' => true,
            ]);
            $count++;
        }

        return $count;
    }

    protected function provisionDiagnosisFavorites(Practice $practice): int
    {
        $specialty = $practice->specialty;
        if (empty($specialty)) return 0;

        $masterSpecialty = MasterSpecialty::where('code', $specialty)->first();
        if (!$masterSpecialty || empty($masterSpecialty->default_diagnosis_favorites)) return 0;

        $favorites = $masterSpecialty->default_diagnosis_favorites;

        // Store as practice setting
        PracticeSetting::updateOrCreate(
            ['practice_id' => $practice->id, 'key' => 'diagnosis_favorites'],
            ['value' => json_encode($favorites)]
        );

        return count($favorites);
    }

    /**
     * Map screening tools to applicable specialties.
     */
    protected function getScreeningSpecialties(string $code): array
    {
        $map = [
            'phq9' => ['psychiatry', 'primary_care', 'family_medicine', 'internal_medicine', 'pain_management', 'addiction_medicine', 'obgyn', 'geriatrics'],
            'gad7' => ['psychiatry', 'primary_care', 'family_medicine', 'internal_medicine', 'pain_management', 'cardiology', 'obgyn', 'geriatrics'],
            'asrs' => ['psychiatry', 'primary_care', 'family_medicine', 'pediatrics'],
            'audit_c' => ['psychiatry', 'primary_care', 'family_medicine', 'internal_medicine', 'addiction_medicine', 'geriatrics'],
            'pcl5' => ['psychiatry', 'primary_care', 'addiction_medicine'],
            'mdq' => ['psychiatry'],
            'cssrs' => ['psychiatry', 'addiction_medicine'],
        ];

        return $map[$code] ?? [];
    }
}
