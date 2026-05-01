<?php

namespace Database\Factories;

use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use App\Models\Practice;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PatientEntitlement>
 */
class PatientEntitlementFactory extends Factory
{
    protected $model = PatientEntitlement::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Practice::factory(),
            'membership_id' => PatientMembership::factory(),
            'patient_id' => Patient::factory(),
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'visits_allowed' => 4,
            'visits_used' => 0,
            'telehealth_sessions_used' => 0,
            'messages_sent' => 0,
            'rollover_visits' => 0,
        ];
    }

    public function exhausted(): static
    {
        return $this->state(fn (array $a) => [
            'visits_used' => $a['visits_allowed'] ?? 4,
        ]);
    }
}
