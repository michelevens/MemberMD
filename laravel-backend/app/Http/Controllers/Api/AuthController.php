<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Practice;
use App\Services\PracticeBootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $user->update(['last_login_at' => now()]);

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'data' => [
                'access_token' => $token,
                'token_type' => 'Bearer',
                'expires_in' => 86400,
                'user' => $this->userPayload($user),
            ],
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'practice_name' => 'required|string|max:255',
            'specialty' => 'required|string|max:100',
            'practice_model' => 'required|string|in:pure_dpc,hybrid,concierge,cash_pay,employer',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'phone' => 'nullable|string|max:30',
        ]);

        // Create the practice (tenant)
        $practice = Practice::create([
            'name' => $validated['practice_name'],
            'specialty' => $validated['specialty'],
            'practice_model' => $validated['practice_model'],
            'owner_email' => $validated['email'],
            'is_active' => true,
        ]);

        // Bootstrap practice with specialty defaults (plans, appointment types, screenings, consents, settings)
        (new PracticeBootstrapService())->bootstrap($practice);

        // Create the practice admin user
        $user = User::create([
            'tenant_id' => $practice->id,
            'name' => $validated['first_name'] . ' ' . $validated['last_name'],
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'phone' => $validated['phone'] ?? null,
            'role' => 'practice_admin',
            'status' => 'active',
            'onboarding_completed' => false,
        ]);

        $user->update(['last_login_at' => now()]);

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'data' => [
                'access_token' => $token,
                'token_type' => 'Bearer',
                'expires_in' => 86400,
                'user' => $this->userPayload($user),
            ],
        ], 201);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->userPayload($request->user()),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'phone' => 'nullable|string|max:30',
        ]);

        $request->user()->update($validated);

        return response()->json([
            'data' => $this->userPayload($request->user()->fresh()),
        ]);
    }

    private function userPayload(User $user): array
    {
        $practice = $user->tenant_id ? Practice::find($user->tenant_id) : null;

        return [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'tenant_id' => $user->tenant_id,
            'status' => $user->status,
            'mfa_enabled' => $user->mfa_enabled,
            'onboarding_completed' => $user->onboarding_completed,
            'last_login_at' => $user->last_login_at,
            'practice' => $practice ? [
                'id' => $practice->id,
                'name' => $practice->name,
                'specialty' => $practice->specialty,
                'practice_model' => $practice->practice_model,
                'tenant_code' => $practice->tenant_code,
            ] : null,
        ];
    }
}
