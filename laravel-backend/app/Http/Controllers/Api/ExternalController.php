<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsentSignature;
use App\Models\ConsentTemplate;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\User;
use App\Services\StripeSubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class ExternalController extends Controller
{
    public function __construct(private readonly StripeSubscriptionService $subscriptions)
    {
    }

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

        // Validate plan belongs to the tenant BEFORE any writes — otherwise
        // a foreign plan_id creates an orphan User+Patient before the 404
        // (audit finding B4, 2026-04-28).
        $plan = MembershipPlan::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->findOrFail($validated['plan_id']);

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

        // Create patient record. Use ?? null for nullable validated fields so
        // requests that omit them don't crash with "Undefined array key".
        $memberId = 'MBR-' . strtoupper(substr($user->id, 0, 6));
        $patient = Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'date_of_birth' => $validated['date_of_birth'],
            'gender' => $validated['gender'] ?? null,
            'phone' => $validated['phone'],
            'email' => $validated['email'],
            'address' => $validated['address'] ?? null,
            'city' => $validated['city'] ?? null,
            'state' => $validated['state'] ?? null,
            'zip' => $validated['zip'] ?? null,
            'primary_care_physician' => $validated['primary_care_physician'] ?? null,
            'pharmacy_name' => $validated['pharmacy_name'] ?? null,
            'emergency_contacts' => [[
                'name' => $validated['emergency_contact_name'],
                'relationship' => $validated['emergency_contact_relationship'],
                'phone' => $validated['emergency_contact_phone'],
            ]],
            'is_active' => true,
        ]);
        // Trial mirroring: if the plan declares trial_days, set trial_ends_at
        // locally so the patient portal can render the countdown even before
        // Stripe acks. The Stripe subscription create below also sets it via
        // trial_period_days; whichever lands first wins.
        $trialDays = (int) ($plan->trial_days ?? 0);
        $trialEndsAt = $trialDays > 0 ? now()->addDays($trialDays) : null;

        $membership = PatientMembership::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_frequency' => $validated['billing_frequency'],
            'started_at' => now(),
            'trial_ends_at' => $trialEndsAt,
            'current_period_start' => now(),
            'current_period_end' => $validated['billing_frequency'] === 'annual'
                ? now()->addYear()
                : now()->addMonth(),
        ]);

        // Persist a ConsentSignature row per acknowledged consent. We snapshot
        // the template's current `version` so future template edits don't
        // retroactively rewrite what the patient agreed to. The signature
        // string is the raw typed name from the widget — replace with a real
        // esignature service later, but the audit fields are correct now.
        $consentTypes = (array) $validated['consents'];
        $templates = ConsentTemplate::where('tenant_id', $practice->id)
            ->whereIn('category', $consentTypes)
            ->where('is_active', true)
            ->get()
            ->keyBy('category');
        foreach ($consentTypes as $category) {
            $template = $templates->get($category);
            if (!$template) {
                continue; // practice hasn't published this template yet — skip rather than block enrollment
            }
            ConsentSignature::create([
                'tenant_id' => $practice->id,
                'patient_id' => $patient->id,
                'template_id' => $template->id,
                'template_version' => $template->version,
                'membership_id' => $membership->id,
                'signature_type' => 'typed',
                'signature_data' => (string) $validated['signature_data'],
                'signed_at' => now(),
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 255),
            ]);
        }

        // Tier 2 Stripe subscription on the practice's connected account.
        // Best-effort: if Stripe isn't configured for this practice yet, we
        // still complete enrollment — billing wires up when the practice
        // finishes Connect onboarding and publishes Stripe prices on plans.
        // The membership is created in 'active' state regardless; webhook
        // arrival of the first invoice.paid will reconcile period dates.
        $stripeWarning = null;
        try {
            $paymentMethodId = $request->input('stripe_payment_method_id');
            $this->subscriptions->createSubscription($membership, $paymentMethodId);
        } catch (Throwable $e) {
            Log::warning('Tier 2 subscription creation failed at enrollment', [
                'membership_id' => $membership->id,
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
            $stripeWarning = 'Subscription will be set up when Stripe is configured.';
        }

        return response()->json(array_filter([
            'message' => 'Enrollment successful!',
            'member_id' => $memberId,
            'patient_id' => $patient->id,
            'stripe_warning' => $stripeWarning,
        ]), 201);
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
