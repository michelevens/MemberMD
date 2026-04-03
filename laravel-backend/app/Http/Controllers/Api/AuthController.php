<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Practice;
use App\Models\SecurityEvent;
use App\Services\PracticeBootstrapService;
use App\Services\PracticeProvisioningService;
use App\Services\TOTPService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

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
            // Log failed login attempt
            $this->logSecurityEvent(
                'login_failed',
                $request,
                $user?->tenant_id,
                $user?->id,
                ['email' => $request->email]
            );

            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        // If MFA is enabled, return a temporary token for MFA verification
        if ($user->mfa_enabled) {
            $mfaToken = $user->createToken('mfa-pending', ['mfa-pending'], now()->addMinutes(5))->plainTextToken;

            $this->logSecurityEvent('mfa_challenge_issued', $request, $user->tenant_id, $user->id);

            return response()->json([
                'data' => [
                    'mfaRequired' => true,
                    'mfaToken' => $mfaToken,
                ],
            ]);
        }

        $user->update(['last_login_at' => now()]);

        $token = $user->createToken('auth-token')->plainTextToken;

        // Log successful login
        $this->logSecurityEvent('login_success', $request, $user->tenant_id, $user->id);

        return response()->json([
            'data' => [
                'access_token' => $token,
                'token_type' => 'Bearer',
                'expires_in' => (int) (config('sanctum.expiration', 60) * 60),
                'user' => $this->userPayload($user),
            ],
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'practice_name' => 'required|string|max:255',
            'specialty' => 'required|string|max:100',
            'practice_model' => 'required|string|in:pure_dpc,hybrid,hybrid_dpc,concierge,cash_pay,employer',
            'selected_programs' => 'nullable|array',
            'selected_programs.*' => 'string|max:100',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'password' => ['required', 'string', 'min:12', 'confirmed', 'regex:/[A-Z]/', 'regex:/[a-z]/', 'regex:/[0-9]/', 'regex:/[^A-Za-z0-9]/'],
            'phone' => 'nullable|string|max:30',
            // Practice details
            'practice_email' => 'nullable|email|max:255',
            'website' => 'nullable|string|max:255',
            'address' => 'nullable|string|max:500',
            'city' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            // Provider details
            'credentials' => 'nullable|string|max:20',
            'npi' => 'nullable|string|max:10',
            'licenses' => 'nullable|array',
            'licenses.*.number' => 'required_with:licenses|string|max:50',
            'licenses.*.state' => 'required_with:licenses|string|max:2',
            'bio' => 'nullable|string|max:2000',
        ]);

        // Create the practice (tenant)
        $slug = \Illuminate\Support\Str::slug($validated['practice_name']);
        $practice = Practice::create([
            'name' => $validated['practice_name'],
            'slug' => $slug,
            'specialty' => $validated['specialty'],
            'selected_programs' => $validated['selected_programs'] ?? null,
            'practice_model' => $validated['practice_model'],
            'owner_email' => $validated['email'],
            'phone' => $validated['phone'] ?? $request->input('phone'),
            'email' => $validated['practice_email'] ?? $validated['email'],
            'website' => $validated['website'] ?? null,
            'address' => $validated['address'] ?? null,
            'city' => $validated['city'] ?? null,
            'state' => $validated['state'] ?? null,
            'zip' => $validated['zip'] ?? null,
            'npi' => $validated['npi'] ?? null,
            'is_active' => true,
        ]);

        // Bootstrap practice with specialty defaults (plans, appointment types, screenings, consents, settings)
        $bootstrapStatus = 'success';
        $bootstrapErrors = [];
        $provisioningSummary = [];

        try {
            (new PracticeBootstrapService())->bootstrap($practice);
        } catch (\Throwable $e) {
            $bootstrapStatus = 'failed';
            $bootstrapErrors[] = 'Bootstrap: ' . $e->getMessage();
            \Illuminate\Support\Facades\Log::error('Bootstrap failed for practice ' . $practice->id, [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
        }

        // Provision programs, screening templates, consent templates, appointment types, diagnosis favorites
        try {
            $provisioningSummary = (new PracticeProvisioningService())->provisionPractice($practice);
        } catch (\Throwable $e) {
            $bootstrapStatus = $bootstrapStatus === 'failed' ? 'failed' : 'partial';
            $bootstrapErrors[] = 'Provisioning: ' . $e->getMessage();
            \Illuminate\Support\Facades\Log::error('Provisioning failed for practice ' . $practice->id, [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
        }

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

        // Create Provider record for the registering provider
        try {
            $licenses = $validated['licenses'] ?? [];
            $primaryLicense = $licenses[0] ?? null;

            $provider = \App\Models\Provider::create([
                'tenant_id' => $practice->id,
                'user_id' => $user->id,
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'credentials' => $validated['credentials'] ?? null,
                'npi' => $validated['npi'] ?? null,
                'license_number' => $primaryLicense['number'] ?? null,
                'license_state' => $primaryLicense['state'] ?? null,
                'licensed_states' => !empty($licenses) ? array_column($licenses, 'state') : null,
                'bio' => $validated['bio'] ?? null,
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'status' => 'active',
                'specialty' => $validated['specialty'],
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Provider creation during registration failed: ' . $e->getMessage());
        }

        // Send welcome email
        try {
            \Illuminate\Support\Facades\Mail::raw(
                "Welcome to MemberMD!\n\n" .
                "Your practice \"{$practice->name}\" has been created successfully.\n\n" .
                "Practice Code: {$practice->tenant_code}\n" .
                "Login: {$validated['email']}\n\n" .
                "Get started at https://app.membermd.io\n\n" .
                "— The MemberMD Team",
                function ($message) use ($validated, $practice) {
                    $message->to($validated['email'])
                        ->subject("Welcome to MemberMD — {$practice->name} is ready!");
                }
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Welcome email failed: ' . $e->getMessage());
        }

        $user->update(['last_login_at' => now()]);

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'data' => [
                'access_token' => $token,
                'token_type' => 'Bearer',
                'expires_in' => (int) (config('sanctum.expiration', 60) * 60),
                'user' => $this->userPayload($user),
                'provisioning' => $provisioningSummary,
                'bootstrap_status' => $bootstrapStatus,
                'bootstrap_errors' => $bootstrapErrors,
            ],
        ], 201);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        $this->logSecurityEvent('logout', $request, $user->tenant_id, $user->id);

        $user->currentAccessToken()->delete();

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
            'date_of_birth' => 'nullable|date',
            'profile_picture' => 'nullable|url|max:500',
        ]);

        $request->user()->update($validated);

        return response()->json([
            'data' => $this->userPayload($request->user()->fresh()),
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password' => 'required|string',
            'new_password' => [
                'required', 'string', 'min:12', 'confirmed',
                'regex:/[A-Z]/', 'regex:/[a-z]/', 'regex:/[0-9]/', 'regex:/[^A-Za-z0-9]/',
            ],
        ]);

        $user = $request->user();

        if (!Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->update(['password' => Hash::make($request->new_password)]);

        // Revoke all tokens except the current one
        $currentTokenId = $user->currentAccessToken()->id;
        $user->tokens()->where('id', '!=', $currentTokenId)->delete();

        $this->logSecurityEvent('password_changed', $request, $user->tenant_id, $user->id);

        return response()->json(['message' => 'Password updated successfully.']);
    }

    public function setupMfa(Request $request): JsonResponse
    {
        $user = $request->user();
        $totp = new TOTPService();

        $secret = $totp->generateSecret();
        $otpauthUrl = $totp->getOtpauthUrl($secret, $user->email);
        $qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($otpauthUrl);

        $this->logSecurityEvent('mfa_setup_initiated', $request, $user->tenant_id, $user->id);

        return response()->json([
            'data' => [
                'secret' => $secret,
                'qrCodeUrl' => $qrCodeUrl,
                'otpauthUrl' => $otpauthUrl,
            ],
        ]);
    }

    public function enableMfa(Request $request): JsonResponse
    {
        $request->validate([
            'code' => 'required|string|digits:6',
            'secret' => 'required|string',
        ]);

        $totp = new TOTPService();

        if (!$totp->verifyCode($request->secret, $request->code)) {
            throw ValidationException::withMessages([
                'code' => ['The verification code is invalid.'],
            ]);
        }

        $user = $request->user();

        // Generate 8 backup recovery codes
        $backupCodes = [];
        $hashedCodes = [];
        for ($i = 0; $i < 8; $i++) {
            $code = strtoupper(Str::random(4) . '-' . Str::random(4));
            $backupCodes[] = $code;
            $hashedCodes[] = Hash::make($code);
        }

        $user->update([
            'mfa_secret' => $request->secret,
            'mfa_enabled' => true,
            'mfa_recovery_codes' => json_encode($hashedCodes),
        ]);

        $this->logSecurityEvent('mfa_enabled', $request, $user->tenant_id, $user->id);

        return response()->json([
            'data' => [
                'enabled' => true,
                'backupCodes' => $backupCodes,
            ],
        ]);
    }

    public function verifyMfa(Request $request): JsonResponse
    {
        $request->validate([
            'mfa_token' => 'required|string',
            'code' => 'required|string|digits:6',
        ]);

        // Parse the token — Sanctum tokens are formatted as "{id}|{plaintext}"
        $parts = explode('|', $request->mfa_token, 2);
        if (count($parts) !== 2) {
            throw ValidationException::withMessages([
                'mfa_token' => ['Invalid MFA token.'],
            ]);
        }

        $accessToken = PersonalAccessToken::find($parts[0]);

        if (!$accessToken || !hash_equals($accessToken->token, hash('sha256', $parts[1]))) {
            throw ValidationException::withMessages([
                'mfa_token' => ['Invalid MFA token.'],
            ]);
        }

        // Verify token is an mfa-pending token and not expired
        if ($accessToken->name !== 'mfa-pending') {
            throw ValidationException::withMessages([
                'mfa_token' => ['Invalid MFA token.'],
            ]);
        }

        if ($accessToken->expires_at && $accessToken->expires_at->isPast()) {
            $accessToken->delete();
            throw ValidationException::withMessages([
                'mfa_token' => ['MFA token has expired. Please log in again.'],
            ]);
        }

        $user = $accessToken->tokenable;

        if (!$user || !$user->mfa_secret) {
            throw ValidationException::withMessages([
                'code' => ['MFA is not configured for this account.'],
            ]);
        }

        $totp = new TOTPService();

        // Try TOTP code first
        $codeValid = $totp->verifyCode($user->mfa_secret, $request->code);

        // If TOTP fails, check recovery codes
        if (!$codeValid && $user->mfa_recovery_codes) {
            $storedCodes = json_decode($user->mfa_recovery_codes, true) ?: [];
            foreach ($storedCodes as $index => $hashedCode) {
                if (Hash::check($request->code, $hashedCode)) {
                    $codeValid = true;
                    // Remove used recovery code
                    unset($storedCodes[$index]);
                    $user->update(['mfa_recovery_codes' => json_encode(array_values($storedCodes))]);
                    $this->logSecurityEvent('mfa_recovery_code_used', $request, $user->tenant_id, $user->id);
                    break;
                }
            }
        }

        if (!$codeValid) {
            $this->logSecurityEvent('mfa_verify_failed', $request, $user->tenant_id, $user->id);

            throw ValidationException::withMessages([
                'code' => ['The verification code is invalid.'],
            ]);
        }

        // Delete the mfa-pending token
        $accessToken->delete();

        // Create a full auth token
        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('auth-token')->plainTextToken;

        $this->logSecurityEvent('login_success', $request, $user->tenant_id, $user->id, ['mfa_verified' => true]);

        return response()->json([
            'data' => [
                'access_token' => $token,
                'token_type' => 'Bearer',
                'expires_in' => (int) (config('sanctum.expiration', 60) * 60),
                'user' => $this->userPayload($user),
            ],
        ]);
    }

    public function disableMfa(Request $request): JsonResponse
    {
        $request->validate([
            'password' => 'required|string',
        ]);

        $user = $request->user();

        if (!Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['The password is incorrect.'],
            ]);
        }

        $user->update([
            'mfa_secret' => null,
            'mfa_enabled' => false,
            'mfa_recovery_codes' => null,
        ]);

        $this->logSecurityEvent('mfa_disabled', $request, $user->tenant_id, $user->id);

        return response()->json(['message' => 'MFA has been disabled.']);
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
            'date_of_birth' => $user->date_of_birth?->toDateString(),
            'profile_picture' => $user->profile_picture,
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

    /**
     * Log a security event (login success/failure, logout, etc.).
     */
    private function logSecurityEvent(string $eventType, Request $request, ?string $tenantId = null, ?string $userId = null, array $metadata = []): void
    {
        try {
            SecurityEvent::create([
                'tenant_id' => $tenantId,
                'user_id' => $userId,
                'event_type' => $eventType,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => !empty($metadata) ? $metadata : null,
            ]);
        } catch (\Throwable $e) {
            \Log::warning('Security event logging failed: ' . $e->getMessage());
        }
    }
}
