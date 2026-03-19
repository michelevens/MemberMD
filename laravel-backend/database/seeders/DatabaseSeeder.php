<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Superadmin — email is unique and non-null, so updateOrCreate is safe
        try {
            $user = User::where('email', 'super@membermd.io')->first();

            if ($user) {
                $user->update([
                    'name' => 'Super Admin',
                    'first_name' => 'Super',
                    'last_name' => 'Admin',
                    'password' => Hash::make('MemberMD2026'),
                    'role' => 'superadmin',
                    'status' => 'active',
                    'onboarding_completed' => true,
                ]);
            } else {
                User::create([
                    'email' => 'super@membermd.io',
                    'name' => 'Super Admin',
                    'first_name' => 'Super',
                    'last_name' => 'Admin',
                    'password' => Hash::make('MemberMD2026'),
                    'role' => 'superadmin',
                    'status' => 'active',
                    'onboarding_completed' => true,
                ]);
            }

            $this->command->info('Seeded superadmin user.');
        } catch (\Throwable $e) {
            $this->command->error('Failed to seed superadmin: ' . $e->getMessage());
            Log::error('DatabaseSeeder superadmin failed', ['error' => $e->getMessage()]);
        }

        // Master data seeders
        $this->call([
            MasterSpecialtySeeder::class,
            ScreeningTemplateSeeder::class,
            ConsentTemplateSeeder::class,
        ]);
    }
}
