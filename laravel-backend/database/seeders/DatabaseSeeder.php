<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Superadmin
        User::updateOrCreate(
            ['email' => 'super@membermd.io'],
            [
                'name' => 'Super Admin',
                'first_name' => 'Super',
                'last_name' => 'Admin',
                'password' => Hash::make('MemberMD2026'),
                'role' => 'superadmin',
                'status' => 'active',
                'onboarding_completed' => true,
            ]
        );

        // Master data seeders
        $this->call([
            MasterSpecialtySeeder::class,
            ScreeningTemplateSeeder::class,
            ConsentTemplateSeeder::class,
        ]);
    }
}
