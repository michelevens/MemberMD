<?php

namespace Database\Factories;

use App\Models\Practice;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Practice>
 */
class PracticeFactory extends Factory
{
    protected $model = Practice::class;

    public function definition(): array
    {
        $name = fake()->company() . ' Direct Primary Care';
        return [
            'name' => $name,
            'slug' => Str::slug($name) . '-' . Str::lower(Str::random(4)),
            'tenant_code' => Str::upper(Str::random(6)),
            'email' => fake()->unique()->safeEmail(),
            'specialty' => 'family_medicine',
            'practice_model' => 'pure_dpc',
            'is_active' => true,
            'subscription_status' => 'active',
        ];
    }
}
