<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class EmployerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $query = Employer::where('tenant_id', $user->tenant_id);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where('name', 'ilike', "%{$search}%");
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $employers = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $employers]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'legal_name' => 'nullable|string|max:255',
            'contact_name' => 'required|string|max:255',
            'contact_email' => 'required|email|max:255',
            'contact_phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'city' => 'nullable|string|max:255',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'employee_count_cap' => 'nullable|integer|min:1',
            'status' => 'nullable|in:active,inactive,pending',
            'notes' => 'nullable|string',
        ]);

        $validated['tenant_id'] = $user->tenant_id;

        $employer = Employer::create($validated);

        return response()->json(['data' => $employer], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $employer = Employer::where('tenant_id', $user->tenant_id)
            ->with(['contracts.membershipPlan'])
            ->findOrFail($id);

        $employer->loadCount(['invoices', 'employees']);

        return response()->json(['data' => $employer]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $employer = Employer::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'legal_name' => 'nullable|string|max:255',
            'contact_name' => 'sometimes|string|max:255',
            'contact_email' => 'sometimes|email|max:255',
            'contact_phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'city' => 'nullable|string|max:255',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'employee_count_cap' => 'nullable|integer|min:1',
            'status' => 'nullable|in:active,inactive,pending',
            'notes' => 'nullable|string',
        ]);

        $employer->update($validated);

        return response()->json(['data' => $employer->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $employer = Employer::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $employer->update(['status' => 'inactive']);

        return response()->json(['data' => ['message' => 'Employer deactivated.']]);
    }

    /**
     * Invite an HR contact to the EmployerPortal as an employer_admin user.
     *
     * Creates a User row scoped to this practice's tenant + this employer,
     * then emails a password-reset link the recipient uses to set their own
     * password. Idempotent on email — re-inviting an existing employer_admin
     * just resends the link instead of erroring.
     *
     * Mirrors PracticeController::inviteStaff but binds to employer_id
     * instead of role-only.
     */
    public function inviteAdmin(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $employer = Employer::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:30',
        ]);

        // Idempotent: if a user with this email already exists in this
        // tenant, just resend the link. Surfacing 422 "email taken" here
        // would block a practice from re-issuing access if HR loses their
        // original invite (common).
        $existingInTenant = User::where('tenant_id', $user->tenant_id)
            ->where('email', $validated['email'])
            ->first();

        if ($existingInTenant) {
            // Refuse if the existing row belongs to a different employer
            // OR has a different (non-employer) role — we don't want to
            // silently re-purpose a practice admin into an HR contact.
            if ($existingInTenant->role !== 'employer_admin'
                || ($existingInTenant->employer_id !== null && $existingInTenant->employer_id !== $employer->id)
            ) {
                return response()->json([
                    'message' => 'A user with that email already exists in this practice with a different role or employer assignment.',
                    'code' => 'email_role_conflict',
                ], 422);
            }
            // Same email, same employer, same role → this is a re-invite.
            // Make sure they're bound to this employer (in case the row
            // was created by a different path) and resend the link.
            if ($existingInTenant->employer_id !== $employer->id) {
                $existingInTenant->update(['employer_id' => $employer->id]);
            }
            $newUser = $existingInTenant;
        } else {
            // Cross-tenant uniqueness check — email-as-login. If the same
            // address is used at another practice, that's allowed; if at
            // SAME practice with conflict, we caught it above.
            if (User::where('email', $validated['email'])->where('tenant_id', '!=', $user->tenant_id)->exists()) {
                return response()->json([
                    'message' => 'That email is already in use at another practice. Use a different address.',
                    'code' => 'email_in_use_elsewhere',
                ], 422);
            }

            $tempPassword = Str::random(16) . 'A1!';
            $newUser = User::create([
                'tenant_id' => $user->tenant_id,
                'employer_id' => $employer->id,
                'email' => $validated['email'],
                'password' => Hash::make($tempPassword),
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'name' => trim($validated['first_name'] . ' ' . $validated['last_name']),
                'phone' => $validated['phone'] ?? null,
                'role' => 'employer_admin',
                'status' => 'active',
                'onboarding_completed' => false,
            ]);
        }

        // Generate a password-reset token + email it. Token is single-use
        // and times out per Laravel's password broker config.
        try {
            $token = Password::createToken($newUser);
            $invitedByName = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: null;
            \App\Services\MailDispatcher::send(
                $newUser->email,
                new \App\Mail\EmployerAdminInvitationEmail(
                    user: $newUser,
                    employer: $employer,
                    token: $token,
                    invitedByName: $invitedByName,
                ),
                'employer.admin_invited',
                $user->tenant_id,
            );
        } catch (\Throwable $e) {
            Log::warning('Employer admin invite email failed (user row created)', [
                'user_id' => $newUser->id,
                'employer_id' => $employer->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => $newUser->only(['id', 'first_name', 'last_name', 'email', 'role', 'status', 'employer_id']),
            'message' => 'Employer admin invitation sent.',
        ], 201);
    }
}
