<?php

namespace Database\Factories;

use App\Models\MembershipPlan;
use App\Models\Practice;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MembershipPlan>
 */
class MembershipPlanFactory extends Factory
{
    protected $model = MembershipPlan::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Practice::factory(),
            'name' => fake()->randomElement(['Essential', 'Complete', 'Premium']),
            'monthly_price' => fake()->randomElement([99.00, 149.00, 199.00]),
            'annual_price' => fake()->randomElement([999.00, 1499.00, 1999.00]),
            'visits_per_month' => 4,
            'telehealth_included' => true,
            'messaging_included' => true,
            'is_active' => true,
            'version' => 1,
        ];
    }

    public function unlimited(): static
    {
        return $this->state(['visits_per_month' => -1]);
    }

    public function withVisits(int $n): static
    {
        return $this->state(['visits_per_month' => $n]);
    }
}
