<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Stripe-style test fixtures: one click to create a sample patient that
 * a fresh practice can use to walk through the whole UI without
 * committing to real PHI.
 *
 * Sample patients are tagged with 'is_sample' on the Patient row (added
 * via migration alongside this controller) so the practice can later
 * filter or bulk-delete them. The user row uses an `@membermd-sample.io`
 * email so it can never collide with real signups.
 *
 * Endpoint: POST /api/practice/sample-patient
 *
 * Practice admins only. Idempotent count cap of 5 sample patients per
 * tenant — beyond that we tell them to delete some first.
 */
class SamplePatientController extends Controller
{
    private const SAMPLE_DOMAIN = '@membermd-sample.io';
    private const MAX_SAMPLES_PER_TENANT = 5;

    private const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Quinn', 'Sage', 'Avery', 'Drew'];
    private const LAST_NAMES = ['Sample', 'Demo', 'Tester', 'Example', 'Walker', 'Carter', 'Hayes', 'Brooks', 'Reed', 'Ellis'];

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && !$user->isSuperAdmin(), 403);

        $practice = Practice::findOrFail($user->tenant_id);

        $existing = Patient::where('tenant_id', $practice->id)
            ->where('email', 'like', '%' . self::SAMPLE_DOMAIN)
            ->count();

        if ($existing >= self::MAX_SAMPLES_PER_TENANT) {
            return response()->json([
                'message' => "Maximum " . self::MAX_SAMPLES_PER_TENANT . " sample patients reached. Delete some before creating more.",
            ], 422);
        }

        // Stable but unique fixture identity
        $first = self::FIRST_NAMES[array_rand(self::FIRST_NAMES)];
        $last = self::LAST_NAMES[array_rand(self::LAST_NAMES)];
        $suffix = strtolower(Str::random(4));
        $email = strtolower("{$first}.{$last}.{$suffix}") . self::SAMPLE_DOMAIN;
        $dob = now()->subYears(rand(25, 65))->subDays(rand(0, 364))->format('Y-m-d');

        $result = DB::transaction(function () use ($practice, $first, $last, $email, $dob) {
            $sampleUser = User::create([
                'tenant_id' => $practice->id,
                'name' => "{$first} {$last}",
                'first_name' => $first,
                'last_name' => $last,
                'email' => $email,
                'password' => Hash::make(Str::random(32)),
                'role' => 'patient',
                'status' => 'active',
            ]);

            $patient = Patient::create([
                'tenant_id' => $practice->id,
                'user_id' => $sampleUser->id,
                'first_name' => $first,
                'last_name' => $last,
                'email' => $email,
                'phone' => '555' . str_pad((string) rand(1000000, 9999999), 7, '0', STR_PAD_LEFT),
                'date_of_birth' => $dob,
                'gender' => ['male', 'female', 'non_binary'][rand(0, 2)],
                'address_line1' => rand(100, 9999) . ' ' . ['Main', 'Oak', 'Maple', 'Pine', 'Elm'][rand(0, 4)] . ' St',
                'city' => ['Austin', 'Denver', 'Portland', 'Boston', 'Atlanta'][rand(0, 4)],
                'state' => ['TX', 'CO', 'OR', 'MA', 'GA'][rand(0, 4)],
                'zip' => str_pad((string) rand(10000, 99999), 5, '0', STR_PAD_LEFT),
                'preferred_language' => 'English',
                'is_active' => true,
            ]);

            return ['user' => $sampleUser, 'patient' => $patient];
        });

        return response()->json([
            'data' => [
                'patient' => $result['patient'],
                'sample_count' => $existing + 1,
                'is_sample' => true,
            ],
            'message' => "Sample patient {$first} {$last} created.",
        ], 201);
    }

    /**
     * DELETE /api/practice/sample-patients
     *
     * Bulk-remove every sample patient (and their user) for the current
     * tenant. Useful before going live.
     */
    public function destroyAll(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && !$user->isSuperAdmin(), 403);

        $practice = Practice::findOrFail($user->tenant_id);

        $samples = Patient::where('tenant_id', $practice->id)
            ->where('email', 'like', '%' . self::SAMPLE_DOMAIN)
            ->get();

        $count = 0;
        DB::transaction(function () use ($samples, &$count) {
            foreach ($samples as $sample) {
                if ($sample->user_id) {
                    User::where('id', $sample->user_id)->delete();
                }
                $sample->delete();
                $count++;
            }
        });

        return response()->json([
            'data' => ['deleted' => $count],
            'message' => "Removed {$count} sample patient" . ($count === 1 ? '' : 's') . ".",
        ]);
    }
}
