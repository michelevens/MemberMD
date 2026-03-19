<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\MasterSpecialty;
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
                'first_name' => 'Super',
                'last_name' => 'Admin',
                'password' => Hash::make('MemberMD2026'),
                'role' => 'superadmin',
                'status' => 'active',
                'onboarding_completed' => true,
            ]
        );

        // Master Specialties
        $specialties = [
            ['name' => 'Psychiatry', 'code' => 'psychiatry', 'default_screening_tools' => ['phq9', 'gad7', 'asrs', 'audit_c', 'pcl5', 'mdq', 'cssrs']],
            ['name' => 'Primary Care', 'code' => 'primary_care', 'default_screening_tools' => ['phq9', 'gad7']],
            ['name' => 'Family Medicine', 'code' => 'family_medicine', 'default_screening_tools' => ['phq9', 'gad7']],
            ['name' => 'Pediatrics', 'code' => 'pediatrics', 'default_screening_tools' => []],
            ['name' => 'Internal Medicine', 'code' => 'internal_medicine', 'default_screening_tools' => ['phq9']],
            ['name' => 'Dermatology', 'code' => 'dermatology', 'default_screening_tools' => []],
            ['name' => 'Cardiology', 'code' => 'cardiology', 'default_screening_tools' => []],
            ['name' => 'Endocrinology', 'code' => 'endocrinology', 'default_screening_tools' => []],
            ['name' => 'OB/GYN', 'code' => 'obgyn', 'default_screening_tools' => ['phq9']],
            ['name' => 'Functional Medicine', 'code' => 'functional_medicine', 'default_screening_tools' => []],
            ['name' => 'Concierge Medicine', 'code' => 'concierge_medicine', 'default_screening_tools' => ['phq9', 'gad7']],
            ['name' => 'Pain Management', 'code' => 'pain_management', 'default_screening_tools' => ['phq9']],
            ['name' => 'Addiction Medicine', 'code' => 'addiction_medicine', 'default_screening_tools' => ['audit_c', 'phq9', 'gad7']],
            ['name' => 'Neurology', 'code' => 'neurology', 'default_screening_tools' => ['phq9']],
        ];

        foreach ($specialties as $spec) {
            MasterSpecialty::updateOrCreate(
                ['code' => $spec['code']],
                [
                    'name' => $spec['name'],
                    'default_screening_tools' => $spec['default_screening_tools'],
                    'is_active' => true,
                ]
            );
        }
    }
}
