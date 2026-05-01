<?php

namespace Database\Factories;

use App\Models\Patient;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Patient>
 */
class PatientFactory extends Factory
{
    protected $model = Patient::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Practice::factory(),
            // Patients have a NOT NULL user_id; create one inline scoped to
            // the same tenant. Tests that need to override the linkage can
            // still pass user_id explicitly.
            'user_id' => function (array $attrs) {
                return User::create([
                    'tenant_id' => $attrs['tenant_id'] ?? null,
                    'name' => fake()->name(),
                    'first_name' => fake()->firstName(),
                    'last_name' => fake()->lastName(),
                    'email' => 'patient-' . Str::lower(Str::random(8)) . '@example.test',
                    'password' => bcrypt('test'),
                    'role' => 'patient',
                ])->id;
            },
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'date_of_birth' => fake()->date('Y-m-d', '-25 years'),
            'is_active' => true,
        ];
    }
}
