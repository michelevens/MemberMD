<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ExternalController extends Controller
{
    /**
     * GET /external/plans/{tenantCode}
     * Public endpoint — returns practice info and active membership plans.
     */
    public function plans(string $tenantCode): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $plans = MembershipPlan::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get([
                'id', 'name', 'description', 'badge_text',
                'monthly_price', 'annual_price',
                'visits_per_month', 'telehealth_included', 'messaging_included',
                'messaging_response_sla_hours', 'crisis_support', 'lab_discount_pct',
                'prescription_management', 'features_list',
            ]);

        return response()->json([
            'data' => [
                'practice_name' => $practice->name,
                'specialty' => $practice->specialty,
                'plans' => $plans,
            ],
        ]);
    }

    /**
     * POST /external/enroll/{tenantCode}
     * Public endpoint — enrolls a new patient into a practice membership.
     */
    public function enroll(Request $request, string $tenantCode): JsonResponse
    {
        // Honeypot check — bots fill the hidden field
        if ($request->filled('website_url')) {
            return response()->json([
                'message' => 'Thank you!',
                'member_id' => 'MBR-000000',
            ]);
        }

        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $validated = $request->validate([
            'plan_id' => 'required|uuid',
            'billing_frequency' => 'required|in:monthly,annual',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'date_of_birth' => 'required|date|before:today',
            'gender' => 'nullable|string',
            'phone' => 'required|string|max:30',
            'email' => 'required|email',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'medications' => 'nullable|string|max:2000',
            'allergies' => 'nullable|string|max:1000',
            'primary_care_physician' => 'nullable|string|max:200',
            'pharmacy_name' => 'nullable|string|max:200',
            'emergency_contact_name' => 'required|string|max:100',
            'emergency_contact_relationship' => 'required|string|max:50',
            'emergency_contact_phone' => 'required|string|max:30',
            'consents' => 'required|array|min:1',
            'signature_data' => 'required|string',
        ]);

        // Create user account for patient
        $user = User::create([
            'tenant_id' => $practice->id,
            'name' => $validated['first_name'] . ' ' . $validated['last_name'],
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'],
            'password' => Hash::make(Str::random(16)),
            'phone' => $validated['phone'],
            'date_of_birth' => $validated['date_of_birth'],
            'role' => 'patient',
            'status' => 'active',
        ]);

        // Create patient record
        $memberId = 'MBR-' . strtoupper(substr($user->id, 0, 6));
        $patient = Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'date_of_birth' => $validated['date_of_birth'],
            'gender' => $validated['gender'],
            'phone' => $validated['phone'],
            'email' => $validated['email'],
            'address' => $validated['address'],
            'city' => $validated['city'],
            'state' => $validated['state'],
            'zip' => $validated['zip'],
            'primary_care_physician' => $validated['primary_care_physician'],
            'pharmacy_name' => $validated['pharmacy_name'],
            'emergency_contacts' => [[
                'name' => $validated['emergency_contact_name'],
                'relationship' => $validated['emergency_contact_relationship'],
                'phone' => $validated['emergency_contact_phone'],
            ]],
            'is_active' => true,
        ]);

        // Create membership
        $plan = MembershipPlan::findOrFail($validated['plan_id']);
        PatientMembership::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_frequency' => $validated['billing_frequency'],
            'started_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => $validated['billing_frequency'] === 'annual'
                ? now()->addYear()
                : now()->addMonth(),
        ]);

        return response()->json([
            'message' => 'Enrollment successful!',
            'member_id' => $memberId,
            'patient_id' => $patient->id,
        ], 201);
    }

    /**
     * GET /external/availability/{tenantCode}
     * Public endpoint — returns practice availability info.
     */
    public function availability(string $tenantCode): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        return response()->json([
            'data' => [
                'practice_name' => $practice->name,
                'accepting_new_patients' => true,
                'panel_capacity' => $practice->panel_capacity,
                'current_members' => Patient::where('tenant_id', $practice->id)
                    ->where('is_active', true)
                    ->count(),
            ],
        ]);
    }
}
