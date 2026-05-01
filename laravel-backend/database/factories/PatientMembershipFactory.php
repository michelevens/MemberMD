<?php

namespace Database\Factories;

use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PatientMembership>
 */
class PatientMembershipFactory extends Factory
{
    protected $model = PatientMembership::class;

    public function definition(): array
    {
        $tenant = Practice::factory();
        return [
            'tenant_id' => $tenant,
            'patient_id' => Patient::factory()->state(fn (array $a, $model) => ['tenant_id' => $a['tenant_id'] ?? null]),
            'plan_id' => MembershipPlan::factory()->state(fn (array $a, $model) => ['tenant_id' => $a['tenant_id'] ?? null]),
            'status' => 'active',
            'billing_frequency' => 'monthly',
            'started_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
            'last_state_change_at' => now(),
        ];
    }

    public function cancelled(): static
    {
        return $this->state([
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancel_reason' => 'tested',
        ]);
    }

    public function paused(): static
    {
        return $this->state([
            'status' => 'paused',
            'paused_at' => now(),
        ]);
    }

    public function pastDue(): static
    {
        return $this->state(['status' => 'past_due']);
    }
}
