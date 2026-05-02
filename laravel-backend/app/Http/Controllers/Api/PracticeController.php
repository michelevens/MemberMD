<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Models\User;
use App\Models\PatientMembership;
use App\Services\PracticeBootstrapService;
use App\Services\PracticeProvisioningService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PracticeController extends Controller
{
    // SuperAdmin: list all practices
    public function index(Request $request): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $query = Practice::query()
            ->withCount(['users', 'patients', 'providers']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                  ->orWhere('specialty', 'ilike', "%{$search}%")
                  ->orWhere('owner_email', 'ilike', "%{$search}%");
            });
        }

        if ($request->filled('specialty')) {
            $query->where('specialty', $request->specialty);
        }

        $practices = $query->orderBy('created_at', 'desc')->get();

        // Add computed fields
        $practices->each(function ($practice) {
            $practice->member_count = $practice->patients_count ?? 0;
            $practice->provider_count = $practice->providers_count ?? 0;
            $practice->status = $practice->is_active ? 'active' : 'suspended';
        });

        return response()->json(['data' => $practices]);
    }

    // SuperAdmin: show single practice — returns the practice with the
    // satellite collections the superadmin detail page needs to render
    // real data instead of mocks (plans, members, providers, activity).
    public function show(Request $request, string $id): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $practice = Practice::withCount(['users', 'patients', 'providers', 'membershipPlans'])
            ->findOrFail($id);

        $plans = \App\Models\MembershipPlan::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('monthly_price')
            ->get([
                'id', 'name', 'monthly_price', 'annual_price',
                'visits_per_month', 'features_list', 'badge_text',
                'telehealth_included', 'messaging_included',
            ]);

        // Recent members — newest 25 with their active membership + plan
        $members = \App\Models\Patient::where('tenant_id', $practice->id)
            ->with(['activeMembership.plan:id,name', 'user:id,first_name,last_name,email'])
            ->orderByDesc('created_at')
            ->limit(25)
            ->get(['id', 'tenant_id', 'user_id', 'created_at']);

        // panel_current is computed from distinct patients seen in
        // appointments — this practice's providers don't have a direct
        // patient FK, so we count from the appointments table.
        $providers = \App\Models\Provider::where('tenant_id', $practice->id)
            ->get([
                'id', 'first_name', 'last_name', 'title', 'credentials',
                'panel_capacity', 'panel_status', 'status',
            ])
            ->map(function ($prov) {
                $prov->panel_current = \DB::table('appointments')
                    ->where('provider_id', $prov->id)
                    ->distinct('patient_id')
                    ->count('patient_id');
                return $prov;
            });

        // Recent activity — last 20 membership lifecycle events
        $activity = \DB::table('membership_lifecycle_events')
            ->where('tenant_id', $practice->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get(['id', 'event_type', 'description', 'created_at']);

        return response()->json(['data' => [
            'practice' => $practice,
            'plans' => $plans,
            'members' => $members,
            'providers' => $providers,
            'activity' => $activity,
        ]]);
    }

    // SuperAdmin: platform stats
    public function platformStats(Request $request): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        return response()->json([
            'data' => [
                'total_practices' => Practice::count(),
                'active_practices' => Practice::where('is_active', true)->count(),
                'total_users' => User::count(),
                'total_patients' => \App\Models\Patient::count(),
                'total_providers' => \App\Models\Provider::count(),
                'practices_this_week' => Practice::where('created_at', '>=', now()->startOfWeek())->count(),
                'practices_this_month' => Practice::where('created_at', '>=', now()->startOfMonth())->count(),
            ],
        ]);
    }

    // Authenticated: get own practice
    public function myPractice(Request $request): JsonResponse
    {
        $practice = Practice::withCount(['patients', 'providers', 'membershipPlans'])
            ->findOrFail($request->user()->tenant_id);

        return response()->json(['data' => $practice]);
    }

    /**
     * Update branding (logo, colors) for the current practice. Used by
     * the email-template preview and any other place that renders
     * practice-aware visuals. Practice admins only.
     */
    public function updateBranding(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && !$user->isSuperAdmin(), 403);

        $validated = $request->validate([
            'primary_color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'accent_color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'logo_url' => ['nullable', 'url', 'max:1000'],
        ]);

        $practice = Practice::findOrFail($user->tenant_id);

        // Merge with existing branding instead of overwriting — admin
        // can update one field at a time without losing the others.
        $current = (array) ($practice->branding ?? []);
        $merged = array_filter(
            array_merge($current, $validated),
            fn ($v) => $v !== null
        );

        $practice->update(['branding' => $merged]);

        return response()->json(['data' => $practice->fresh()]);
    }

    /**
     * Superadmin: list every practice in pending_approval state.
     * Drives the SuperAdmin "Pending Approvals" tab.
     */
    public function pendingApprovals(Request $request): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $rows = Practice::where('subscription_status', 'pending_approval')
            ->orderByDesc('created_at')
            ->get();

        $data = $rows->map(function (Practice $p) {
            // Find the registering admin user for the applicant column
            $applicant = User::where('tenant_id', $p->id)
                ->where('role', 'practice_admin')
                ->orderBy('created_at')
                ->first();

            return [
                'id' => $p->id,
                'name' => $p->name,
                'specialty' => $p->specialty,
                'practice_model' => $p->practice_model,
                'email' => $p->email,
                'phone' => $p->phone,
                'website' => $p->website,
                'city' => $p->city,
                'state' => $p->state,
                'submitted_at' => $p->created_at,
                'applicant' => $applicant ? [
                    'name' => trim(($applicant->first_name ?? '') . ' ' . ($applicant->last_name ?? '')) ?: $applicant->name,
                    'email' => $applicant->email,
                ] : null,
            ];
        });

        return response()->json(['data' => $data]);
    }

    /**
     * Superadmin: approve a pending practice.
     * Activates the tenant, fires PracticeApprovedEmail, sets approved_at.
     */
    public function approve(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $practice = Practice::findOrFail($practiceId);

        if ($practice->subscription_status !== 'pending_approval') {
            return response()->json([
                'message' => "Practice is in '{$practice->subscription_status}' state — already approved or rejected.",
            ], 422);
        }

        $practice->update([
            'is_active' => true,
            'subscription_status' => 'trial',
            'approved_at' => now(),
            'approved_by' => $request->user()->id,
        ]);

        // Notify the practice admin so they know they can sign in now.
        try {
            $admin = User::where('tenant_id', $practice->id)
                ->where('role', 'practice_admin')
                ->orderBy('created_at')
                ->first();
            if ($admin) {
                \App\Services\MailDispatcher::send(
                    $admin->email,
                    new \App\Mail\PracticeApprovedEmail(user: $admin, practice: $practice),
                    'practice-approved',
                );
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Approval email failed', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => $practice->fresh(),
            'message' => "Approved {$practice->name}.",
        ]);
    }

    /**
     * Superadmin: reject a pending practice with an optional reason.
     */
    public function reject(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $data = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $practice = Practice::findOrFail($practiceId);

        if ($practice->subscription_status !== 'pending_approval') {
            return response()->json([
                'message' => "Practice is in '{$practice->subscription_status}' state — cannot reject.",
            ], 422);
        }

        $practice->update([
            'is_active' => false,
            'subscription_status' => 'rejected',
            'rejected_at' => now(),
            'rejection_reason' => $data['reason'] ?? null,
        ]);

        try {
            $admin = User::where('tenant_id', $practice->id)
                ->where('role', 'practice_admin')
                ->orderBy('created_at')
                ->first();
            if ($admin) {
                \App\Services\MailDispatcher::send(
                    $admin->email,
                    new \App\Mail\PracticeRejectedEmail(
                        user: $admin,
                        practice: $practice,
                        reason: $data['reason'] ?? null,
                    ),
                    'practice-rejected',
                );
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Rejection email failed', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => $practice->fresh(),
            'message' => "Rejected {$practice->name}.",
        ]);
    }

    /**
     * Superadmin: log in as the practice's owner.
     *
     * Mints a 2-hour Sanctum token bound to the practice_admin owner so
     * the superadmin can reproduce a tenant-side issue without asking
     * for credentials. Revokes any prior impersonation tokens for the
     * same owner first so concurrent impersonation sessions don't
     * accumulate.
     *
     * Every impersonation is audit-logged with both the superadmin and
     * the owner ids so the tenant can later see who was acting on their
     * behalf.
     */
    public function impersonate(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $practice = Practice::findOrFail($practiceId);

        $owner = User::where('tenant_id', $practice->id)
            ->whereIn('role', ['practice_admin', 'provider', 'staff'])
            ->orderByRaw("CASE role WHEN 'practice_admin' THEN 1 WHEN 'provider' THEN 2 ELSE 3 END")
            ->orderBy('created_at')
            ->first();

        if (!$owner) {
            return response()->json([
                'message' => 'No practice user found to impersonate.',
            ], 422);
        }

        // Revoke prior impersonation tokens so we never have two live
        // shadow sessions on the same owner.
        $owner->tokens()->where('name', 'impersonation')->delete();

        $expiresAt = now()->addHours(2);
        $token = $owner->createToken('impersonation', ['*'], $expiresAt);

        try {
            \App\Models\AuditLog::create([
                'tenant_id' => $practice->id,
                'user_id' => $request->user()->id,
                'action' => 'superadmin.impersonate',
                'resource' => 'Practice',
                'resource_id' => $practice->id,
                'metadata' => [
                    'superadmin_id' => $request->user()->id,
                    'superadmin_email' => $request->user()->email,
                    'impersonated_user_id' => $owner->id,
                    'impersonated_user_email' => $owner->email,
                    'expires_at' => $expiresAt->toIso8601String(),
                ],
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 512) ?: null,
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Impersonation audit write failed', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => [
                'token' => $token->plainTextToken,
                'tenant_id' => $practice->id,
                'tenant_name' => $practice->name,
                'impersonated_user' => [
                    'id' => $owner->id,
                    'first_name' => $owner->first_name,
                    'last_name' => $owner->last_name,
                    'email' => $owner->email,
                    'role' => $owner->role,
                ],
                'impersonated_by' => $request->user()->id,
                'expires_at' => $expiresAt->toIso8601String(),
            ],
        ]);
    }

    /**
     * Superadmin: suspend an active practice. Sets is_active=false and
     * subscription_status='suspended'. Patient-facing surfaces hide the
     * practice; staff sign-in is blocked by the existing pending guard
     * because suspended != approved-and-active.
     */
    public function suspend(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $data = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $practice = Practice::findOrFail($practiceId);
        $practice->update([
            'is_active' => false,
            'subscription_status' => 'suspended',
        ]);

        try {
            \App\Models\AuditLog::create([
                'tenant_id' => $practice->id,
                'user_id' => $request->user()->id,
                'action' => 'superadmin.suspend',
                'resource' => 'Practice',
                'resource_id' => $practice->id,
                'metadata' => ['reason' => $data['reason'] ?? null],
            ]);
        } catch (\Throwable) {
            // Audit best-effort — do not block the action.
        }

        return response()->json([
            'data' => $practice->fresh(),
            'message' => "Suspended {$practice->name}.",
        ]);
    }

    /**
     * Superadmin: re-activate a suspended practice. Restores
     * is_active=true and subscription_status='trial' (re-onboarded
     * practices typically resume on trial; superadmin can change plan
     * inline if not).
     */
    public function activate(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $practice = Practice::findOrFail($practiceId);
        $practice->update([
            'is_active' => true,
            'subscription_status' => 'trial',
        ]);

        try {
            \App\Models\AuditLog::create([
                'tenant_id' => $practice->id,
                'user_id' => $request->user()->id,
                'action' => 'superadmin.activate',
                'resource' => 'Practice',
                'resource_id' => $practice->id,
            ]);
        } catch (\Throwable) {
            // Audit best-effort.
        }

        return response()->json([
            'data' => $practice->fresh(),
            'message' => "Activated {$practice->name}.",
        ]);
    }

    /**
     * Superadmin: change the practice's subscription plan. Stripe
     * subscription is NOT touched here (that's a separate billing
     * surface) — this only flips the local tier so reporting and
     * feature gating reflect what the practice is actually paying for.
     */
    public function changePlan(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $data = $request->validate([
            'plan' => 'required|string|in:trial,starter,professional,enterprise',
        ]);

        $practice = Practice::findOrFail($practiceId);
        $previous = $practice->subscription_plan;
        $practice->update([
            'subscription_plan' => $data['plan'],
        ]);

        try {
            \App\Models\AuditLog::create([
                'tenant_id' => $practice->id,
                'user_id' => $request->user()->id,
                'action' => 'superadmin.plan_change',
                'resource' => 'Practice',
                'resource_id' => $practice->id,
                'metadata' => ['from' => $previous, 'to' => $data['plan']],
            ]);
        } catch (\Throwable) {
            // Audit best-effort.
        }

        return response()->json([
            'data' => $practice->fresh(),
            'message' => "Plan changed to {$data['plan']}.",
        ]);
    }

    /**
     * Superadmin-only: list internal notes about a tenant. NEVER
     * exposed to tenant users. Notes are append-only from the UI;
     * the full thread reads like a CRM history.
     */
    public function listInternalNotes(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $rows = \App\Models\PracticeInternalNote::with('author:id,first_name,last_name,email,name')
            ->where('tenant_id', $practiceId)
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return response()->json([
            'data' => $rows->map(fn ($n) => [
                'id' => $n->id,
                'body' => $n->body,
                'category' => $n->category,
                'created_at' => $n->created_at,
                'author' => $n->author ? [
                    'id' => $n->author->id,
                    'name' => trim(($n->author->first_name ?? '') . ' ' . ($n->author->last_name ?? '')) ?: $n->author->name,
                    'email' => $n->author->email,
                ] : null,
            ])->values(),
        ]);
    }

    /**
     * Superadmin-only: create an internal note about a tenant.
     */
    public function createInternalNote(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $data = $request->validate([
            'body' => 'required|string|max:4000',
            'category' => 'nullable|string|in:general,billing,support,risk',
        ]);

        Practice::findOrFail($practiceId);

        $note = \App\Models\PracticeInternalNote::create([
            'tenant_id' => $practiceId,
            'author_id' => $request->user()->id,
            'body' => $data['body'],
            'category' => $data['category'] ?? 'general',
        ]);

        return response()->json([
            'data' => [
                'id' => $note->id,
                'body' => $note->body,
                'category' => $note->category,
                'created_at' => $note->created_at,
                'author' => [
                    'id' => $request->user()->id,
                    'name' => trim(($request->user()->first_name ?? '') . ' ' . ($request->user()->last_name ?? '')) ?: $request->user()->name,
                    'email' => $request->user()->email,
                ],
            ],
        ], 201);
    }

    /**
     * Superadmin-only: lifetime revenue, invoice + active membership +
     * per-role user counts for one practice. Drives the KPI tiles on
     * the practice detail header.
     */
    public function tenantSummary(Request $request, string $practiceId): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $practice = Practice::findOrFail($practiceId);

        $lifetimeRevenue = (float) \App\Models\Invoice::where('tenant_id', $practice->id)
            ->where('status', 'paid')
            ->sum('amount');

        $invoiceCount = \App\Models\Invoice::where('tenant_id', $practice->id)->count();

        $userCounts = User::where('tenant_id', $practice->id)
            ->selectRaw('role, count(*) as c')
            ->groupBy('role')
            ->pluck('c', 'role');

        $activeMembershipCount = \App\Models\PatientMembership::where('tenant_id', $practice->id)
            ->where('status', 'active')
            ->count();

        return response()->json([
            'data' => [
                'practice_id' => $practice->id,
                'lifetime_revenue' => $lifetimeRevenue,
                'invoice_count' => $invoiceCount,
                'active_membership_count' => $activeMembershipCount,
                'user_counts_by_role' => $userCounts,
            ],
        ]);
    }

    /**
     * Mark the auth user's onboarding checklist as completed. Used to
     * dismiss the dashboard onboarding banner once the practice has
     * worked through the first-day setup steps.
     */
    public function completeOnboarding(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->update(['onboarding_completed' => true]);

        return response()->json([
            'data' => ['onboarding_completed' => true],
        ]);
    }

    /**
     * Re-run bootstrap + provisioning for the current practice.
     *
     * Practices that signed up before specific seeders (e.g. EntitlementType)
     * existed end up with an empty catalog and a broken Add Entitlement UI.
     * Both services are idempotent (updateOrCreate / existence checks), so
     * triggering this is safe even on healthy practices.
     *
     * Practice admins re-bootstrap their own practice; superadmin can target
     * any practice via ?practice_id=...
     */
    public function rebootstrap(
        Request $request,
        PracticeBootstrapService $bootstrap,
        PracticeProvisioningService $provisioning,
    ): JsonResponse {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && !$user->isSuperAdmin(), 403);

        $practiceId = $request->input('practice_id');
        if ($practiceId && !$user->isSuperAdmin()) {
            abort(403, 'Only superadmin can target another practice.');
        }
        $practice = Practice::findOrFail($practiceId ?: $user->tenant_id);

        $errors = [];
        try {
            $bootstrap->bootstrap($practice);
        } catch (\Throwable $e) {
            $errors[] = 'Bootstrap: ' . $e->getMessage();
            Log::error('rebootstrap: bootstrap failed', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

        $summary = [];
        try {
            $summary = $provisioning->provisionPractice($practice);
        } catch (\Throwable $e) {
            $errors[] = 'Provisioning: ' . $e->getMessage();
            Log::error('rebootstrap: provisioning failed', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => [
                'practice_id' => $practice->id,
                'practice_name' => $practice->name,
                'provisioning' => $summary,
                'status' => empty($errors) ? 'success' : 'partial',
                'errors' => $errors,
            ],
        ], empty($errors) ? 200 : 207);
    }
}
