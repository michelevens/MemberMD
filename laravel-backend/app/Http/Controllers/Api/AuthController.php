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
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
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

        // Rate limit by email + IP. Two keys (email-only and IP-only)
        // means attackers can't bypass either:
        //  - Spreading attempts across IPs still hits the per-email limit.
        //  - Spreading attempts across emails still hits the per-IP limit.
        $emailKey = 'login-email:' . strtolower($request->email);
        $ipKey = 'login-ip:' . $request->ip();
        if (RateLimiter::tooManyAttempts($emailKey, 5)
            || RateLimiter::tooManyAttempts($ipKey, 20)) {
            $this->logSecurityEvent(
                'login_throttled',
                $request,
                null,
                null,
                ['email' => $request->email]
            );
            $seconds = max(
                RateLimiter::availableIn($emailKey),
                RateLimiter::availableIn($ipKey)
            );
            return response()->json([
                'message' => "Too many login attempts. Try again in {$seconds} seconds.",
            ], 429);
        }

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            // Hit BOTH counters on a failed attempt so neither bucket can be
            // exhausted independently. 60-second decay window.
            RateLimiter::hit($emailKey, 60);
            RateLimiter::hit($ipKey, 60);

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

        // Successful login resets the email counter so the user isn't locked
        // out by their own past typos. IP counter persists — that's a
        // network-level signal, not a per-account one.
        RateLimiter::clear($emailKey);

        // Pending-approval guard. Practices in 'pending_approval' or
        // 'rejected' state can't sign in until a Superadmin reviews
        // them. Superadmin role bypasses since they need to log in to
        // approve other practices.
        if ($user->role !== 'superadmin' && $user->tenant_id) {
            $practice = \App\Models\Practice::find($user->tenant_id);
            if ($practice) {
                if ($practice->subscription_status === 'pending_approval') {
                    return response()->json([
                        'message' => 'Your practice is awaiting Superadmin approval. We will email you when your account is activated.',
                        'errors' => ['email' => ['Account pending approval.']],
                    ], 403);
                }
                if ($practice->subscription_status === 'rejected') {
                    return response()->json([
                        'message' => 'Your practice application was not approved. Contact support@membermd.io for details.',
                        'errors' => ['email' => ['Account not approved.']],
                    ], 403);
                }
            }
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
            // Opt-in: fork the specialty's default_plan_templates JSON
            // blueprints into real MembershipPlan rows on signup. Closes
            // the first-mile gap where a fresh practice can't enroll a
            // patient because there are zero plans to enroll into.
            'use_starter_plans' => 'nullable|boolean',
        ]);

        // Create the practice (tenant). Land in pending_approval so a
        // Superadmin reviews + approves before the practice can take real
        // bookings. is_active stays false until approval; the login guard
        // blocks sign-in attempts in this window with a friendly message.
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
            'is_active' => false,
            'subscription_status' => 'pending_approval',
        ]);

        // Bootstrap a Solo trial PracticeSubscription so the practice has a
        // billing row from day one. 14-day trial mirrors the standard SaaS
        // playbook in project_practice_subscription_cancellation.md. Without
        // this, the Subscription tab would render "No subscription on file"
        // because the backfill migration only runs against existing
        // practices on deploy boot, not new sign-ups.
        try {
            $soloPlan = \App\Models\PlatformPlan::where('key', 'solo')->first();
            if ($soloPlan) {
                \App\Models\PracticeSubscription::create([
                    'practice_id' => $practice->id,
                    'platform_plan_id' => $soloPlan->id,
                    'status' => 'trial',
                    'billing_cycle' => 'monthly',
                    'trial_ends_at' => now()->addDays(14),
                    'is_founder_override' => false,
                ]);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Failed to auto-create platform subscription on signup', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

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

        // Opt-in: fork starter plan blueprints from the specialty into
        // real MembershipPlan rows. Best-effort — failure here doesn't
        // block registration, the practice can call /practice/starter-plans
        // later or build their own plans from the Practice Portal.
        $starterPlanCount = 0;
        if (!empty($validated['use_starter_plans'])) {
            try {
                $specialty = \App\Models\MasterSpecialty::where('code', strtolower((string) $practice->specialty))
                    ->orWhere('name', $practice->specialty)
                    ->first();
                $blueprints = $specialty?->default_plan_templates ?? [];
                foreach ($blueprints as $tpl) {
                    if (empty($tpl['name'])) continue;
                    $exists = \App\Models\MembershipPlan::where('tenant_id', $practice->id)
                        ->where('name', $tpl['name'])
                        ->exists();
                    if ($exists) continue;
                    \App\Models\MembershipPlan::create([
                        'tenant_id' => $practice->id,
                        'name' => $tpl['name'],
                        'description' => $tpl['description'] ?? null,
                        'badge_text' => $tpl['badge_text'] ?? null,
                        'monthly_price' => $tpl['monthly_price'] ?? 0,
                        'annual_price' => $tpl['annual_price'] ?? null,
                        'visits_per_month' => $tpl['visits_per_month'] ?? -1,
                        'telehealth_included' => $tpl['telehealth_included'] ?? true,
                        'messaging_included' => $tpl['messaging_included'] ?? true,
                        'messaging_response_sla_hours' => $tpl['messaging_response_sla_hours'] ?? null,
                        'crisis_support' => $tpl['crisis_support'] ?? false,
                        'is_active' => true,
                        'version' => 1,
                    ]);
                    $starterPlanCount++;
                }
                $provisioningSummary['starter_plans'] = $starterPlanCount;

                // Try to sync the freshly-forked plans to Stripe immediately.
                // No-op when Connect isn't ready yet (the common case at
                // signup — Connect onboarding happens in a separate step).
                // The StripeConnectService::refreshStatus hook re-runs sync
                // when the practice eventually completes Connect, so plans
                // forked here always end up billable.
                if ($starterPlanCount > 0 && $practice->fresh()->canAcceptPayments()) {
                    try {
                        app(\App\Services\StripeConnectService::class)
                            ->syncUnsyncedPlans($practice->fresh());
                    } catch (\Throwable $e) {
                        \Illuminate\Support\Facades\Log::warning('Starter plan Stripe sync failed at registration', [
                            'practice_id' => $practice->id,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Starter plan fork failed at registration', [
                    'practice_id' => $practice->id,
                    'error' => $e->getMessage(),
                ]);
            }
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

        // Per ADR-0001: every Practice has an Operator. Make the registering
        // user the owner of their auto-created Operator. Solo customers won't
        // see this until they need it; multi-clinic operators upgrade in place.
        if ($practice->operator_id) {
            \App\Models\OperatorUser::create([
                'operator_id' => $practice->operator_id,
                'user_id' => $user->id,
                'operator_role' => \App\Models\OperatorUser::ROLE_OWNER,
            ]);
        }

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

        // Send "received your application" confirmation email. The
        // branded Welcome email fires later when the Superadmin approves.
        try {
            \App\Services\MailDispatcher::send(
                $validated['email'],
                new \App\Mail\RegistrationReceivedEmail(
                    user: $user,
                    practice: $practice,
                ),
                'practice-registration-received',
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Registration confirmation email failed', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

        // Notify Superadmin(s) that a new practice is awaiting review.
        // Recipient list:
        //   1. Always include SUPERADMIN_NOTIFICATION_EMAIL when set —
        //      production uses this to route alerts to a real inbox
        //      (the seeded super@membermd.io account is for sign-in,
        //      not necessarily a deliverable address).
        //   2. Plus every active superadmin user with a deliverable
        //      email (skip the seed account when its email is the
        //      placeholder).
        try {
            $recipients = [];
            $envInbox = env('SUPERADMIN_NOTIFICATION_EMAIL');
            if (is_string($envInbox) && filter_var($envInbox, FILTER_VALIDATE_EMAIL)) {
                $recipients[] = $envInbox;
            }
            $superadmins = User::where('role', 'superadmin')
                ->where('status', 'active')
                ->get();
            foreach ($superadmins as $admin) {
                if (!$admin->email) continue;
                // Skip the placeholder seed inbox — it points nowhere
                // real and would just generate failed-send noise in
                // mail_dispatch_logs. Production should set
                // SUPERADMIN_NOTIFICATION_EMAIL to override.
                if ($admin->email === 'super@membermd.io') continue;
                $recipients[] = $admin->email;
            }
            $recipients = array_values(array_unique($recipients));

            \Illuminate\Support\Facades\Log::info('Superadmin new-practice notification dispatch', [
                'practice_id' => $practice->id,
                'recipient_count' => count($recipients),
                'recipients' => $recipients,
            ]);

            foreach ($recipients as $to) {
                \App\Services\MailDispatcher::send(
                    $to,
                    new \App\Mail\NewPracticeApplicationEmail(
                        practice: $practice,
                        applicantUser: $user,
                    ),
                    'superadmin-new-practice',
                );
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Superadmin notification failed', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

        // Pending-approval registrations DO NOT auto-login. Returning a
        // token would let them into the portal, but the login guard
        // would block their next request anyway. Better UX: tell them
        // up front, no token issued.
        return response()->json([
            'data' => [
                'status' => 'pending_approval',
                'practice_id' => $practice->id,
                'practice_name' => $practice->name,
                'applicant_email' => $validated['email'],
                'message' => 'Your application has been received. A Superadmin will review and activate your account — we\'ll email you when it\'s ready.',
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

    /**
     * Send a password-reset email. Always returns 200 even when the email
     * doesn't match a known user — disclosing which emails exist is a user
     * enumeration vector. The status differential goes to the audit log.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email']);

        $key = 'pwreset-email:' . strtolower($request->email);
        if (RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json([
                'message' => 'Too many reset requests. Try again later.',
            ], 429);
        }
        RateLimiter::hit($key, 600); // 10-minute decay

        $status = Password::sendResetLink(['email' => $request->email]);

        $this->logSecurityEvent(
            'password_reset_requested',
            $request,
            null,
            null,
            ['email' => $request->email, 'status' => $status]
        );

        // Loud log when the broker decided NOT to send — Laravel returns
        // a status string like "passwords.throttled" or "passwords.user"
        // (no such user) silently. Without this, "I never got the email"
        // looks like a mail-driver problem when really the broker
        // refused to dispatch in the first place.
        if ($status !== Password::RESET_LINK_SENT) {
            \Illuminate\Support\Facades\Log::warning('Password reset link NOT sent', [
                'email' => $request->email,
                'broker_status' => $status,
                'reason' => match ($status) {
                    Password::INVALID_USER => 'No user with this email',
                    Password::RESET_THROTTLED => 'Laravel broker throttled (60s window per user)',
                    default => 'Other broker rejection',
                },
            ]);
        }

        // Always return the same generic response.
        return response()->json([
            'message' => 'If an account exists for that email, a reset link has been sent.',
        ]);
    }

    /**
     * Consume a password reset token and set a new password.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'token' => 'required|string',
            'password' => ['required', 'string', 'min:12', 'confirmed',
                'regex:/[A-Z]/', 'regex:/[a-z]/', 'regex:/[0-9]/', 'regex:/[^A-Za-z0-9]/'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => Hash::make($password)])->save();
                // Revoke all existing sessions — a password reset implies
                // the user may have been compromised; existing tokens
                // shouldn't survive.
                $user->tokens()->delete();
            }
        );

        if ($status !== Password::PasswordReset) {
            $this->logSecurityEvent(
                'password_reset_failed',
                $request,
                null,
                null,
                ['email' => $request->email, 'status' => $status]
            );
            throw ValidationException::withMessages(['email' => [__($status)]]);
        }

        $this->logSecurityEvent(
            'password_reset_success',
            $request,
            null,
            null,
            ['email' => $request->email]
        );

        return response()->json(['message' => 'Password has been reset.']);
    }

    /**
     * Admin-only: generate a password-reset link for an arbitrary user
     * in the same tenant and return it in the response. Bypasses email
     * entirely — used for customer support ("the user never got the
     * email, send me the link directly so I can pass it to them") and
     * for QA / testing patient login when mail delivery is being
     * troubleshooted. The link is identical to what the broker would
     * email, so consumes one entry in password_reset_tokens.
     */
    public function generateResetLinkForUser(Request $request, string $userId): JsonResponse
    {
        $actor = $request->user();
        abort_if(!$actor->isPracticeAdmin() && !$actor->isSuperAdmin(), 403);

        // Superadmin can target any user in any tenant (used for support
        // when a practice admin reports "I never got the reset email").
        // Practice admins can only target users in their own tenant.
        $query = User::where('id', $userId);
        if (!$actor->isSuperAdmin()) {
            $query->where('tenant_id', $actor->tenant_id);
        }
        $target = $query->first();

        if (!$target) {
            return response()->json(['message' => 'User not found.'], 404);
        }

        $token = Password::broker()->createToken($target);
        $frontend = env('FRONTEND_URL', 'https://app.membermd.io');
        $resetUrl = rtrim($frontend, '/') . "/#/reset-password?token={$token}&email=" . urlencode($target->email);

        $this->logSecurityEvent(
            'password_reset_link_generated_by_admin',
            $request,
            $target->tenant_id,
            $target->id,
            ['target_email' => $target->email, 'admin_user_id' => $actor->id]
        );

        return response()->json([
            'data' => [
                'reset_url' => $resetUrl,
                'expires_in_minutes' => 60,
                'user_email' => $target->email,
            ],
        ]);
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

    /**
     * Begin MFA enrollment. The TOTP secret is held server-side in cache
     * for 10 minutes; the client never sees it after the QR code is
     * scanned, and the client never sends it back. This prevents an
     * attacker who can submit forms in a compromised browser session
     * (XSS or social-engineered link) from enabling MFA against a
     * secret of their own choosing.
     */
    public function setupMfa(Request $request): JsonResponse
    {
        $user = $request->user();
        $totp = new TOTPService();

        $secret = $totp->generateSecret();
        $otpauthUrl = $totp->getOtpauthUrl($secret, $user->email);
        $qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($otpauthUrl);

        // Store the candidate secret server-side. Key is per-user so
        // concurrent setups don't collide; TTL caps how long an
        // abandoned setup attempt sits around.
        Cache::put('mfa-setup:' . $user->id, $secret, now()->addMinutes(10));

        $this->logSecurityEvent('mfa_setup_initiated', $request, $user->tenant_id, $user->id);

        return response()->json([
            'data' => [
                'qrCodeUrl' => $qrCodeUrl,
                'otpauthUrl' => $otpauthUrl,
            ],
        ]);
    }

    public function enableMfa(Request $request): JsonResponse
    {
        $request->validate([
            'code' => 'required|string|digits:6',
        ]);

        $user = $request->user();
        $cacheKey = 'mfa-setup:' . $user->id;
        $secret = Cache::get($cacheKey);

        if (!$secret) {
            throw ValidationException::withMessages([
                'code' => ['MFA setup expired. Restart the enrollment flow.'],
            ]);
        }

        $totp = new TOTPService();
        if (!$totp->verifyCode($secret, $request->code)) {
            throw ValidationException::withMessages([
                'code' => ['The verification code is invalid.'],
            ]);
        }

        // Generate 8 backup recovery codes
        $backupCodes = [];
        $hashedCodes = [];
        for ($i = 0; $i < 8; $i++) {
            $code = strtoupper(Str::random(4) . '-' . Str::random(4));
            $backupCodes[] = $code;
            $hashedCodes[] = Hash::make($code);
        }

        $user->update([
            'mfa_secret' => $secret,
            'mfa_enabled' => true,
            'mfa_recovery_codes' => json_encode($hashedCodes),
        ]);

        // Burn the cache entry — single-use enrollment.
        Cache::forget($cacheKey);

        $this->logSecurityEvent('mfa_enabled', $request, $user->tenant_id, $user->id);

        // Send confirmation — security-sensitive change, the user should
        // know it happened. If they DIDN'T do this, the email is the
        // canary that lets them react before the attacker locks them out.
        \App\Services\MailDispatcher::send(
            $user->email,
            new \App\Mail\MfaEnabledMail(user: $user, ipAddress: $request->ip() ?? 'unknown'),
            'mfa-enabled',
        );

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

        // Practice's own MemberMD subscription summary — surfaced inline so
        // every API consumer can render usage badges + cap warnings without
        // a separate /me/subscription round-trip on every page mount.
        // Only computed when there's a tenant; superadmin/no-tenant users
        // get null.
        $subscriptionSummary = null;
        if ($user->tenant_id) {
            $sub = \App\Models\PracticeSubscription::with('plan')
                ->where('practice_id', $user->tenant_id)
                ->latest()
                ->first();
            if ($sub && $sub->plan) {
                $subscriptionSummary = [
                    'id' => $sub->id,
                    'status' => $sub->status,
                    'is_founder_override' => (bool) $sub->is_founder_override,
                    'trial_ends_at' => $sub->trial_ends_at?->toIso8601String(),
                    'cancels_at' => $sub->cancels_at?->toIso8601String(),
                    'plan' => [
                        'id' => $sub->plan->id,
                        'key' => $sub->plan->key,
                        'name' => $sub->plan->name,
                        'monthly_price' => $sub->plan->monthly_price,
                        'max_members' => $sub->plan->max_members,
                        'max_providers' => $sub->plan->max_providers,
                        'max_staff' => $sub->plan->max_staff,
                        'max_active_programs' => $sub->plan->max_active_programs,
                        'max_locations' => $sub->plan->max_locations,
                        'max_employers' => $sub->plan->max_employers,
                        'api_access_level' => $sub->plan->api_access_level,
                        'features' => $sub->plan->features ?? [],
                    ],
                    'usage' => \App\Http\Controllers\Api\PracticeSubscriptionController::computeUsage($user->tenant_id),
                ];
            }
        }

        // Surface operator memberships so the SPA can route to OperatorPortal
        // when the user is an operator member. See ROADMAP H1 / Operator OS.
        $operatorMemberships = $user->operatorMemberships()->with('operator:id,name,slug')->get();
        $operators = $operatorMemberships->map(function ($m) {
            if (!$m->operator) {
                return null;
            }
            return [
                'id' => $m->operator->id,
                'name' => $m->operator->name,
                'slug' => $m->operator->slug,
                'role' => $m->operator_role,
                'tenant_count' => $m->operator->practices()->count(),
            ];
        })->filter()->values();

        // Linked patient row id — surfaced for role=patient so the SPA
        // can submit appointment / billing requests scoped by patient_id
        // without a separate /patients/me round-trip. Null for staff/admin.
        $patientId = $user->role === 'patient' && $user->patient ? $user->patient->id : null;

        // Linked provider row id — surfaced for role=provider so the
        // provider's "My Profile" view in PracticePortal can mount
        // ProviderDetailPage against the logged-in provider's own row
        // without a separate /providers/me lookup.
        $providerId = $user->role === 'provider' && $user->provider ? $user->provider->id : null;

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
            'patient_id' => $patientId,
            'provider_id' => $providerId,
            'practice' => $practice ? [
                'id' => $practice->id,
                'name' => $practice->name,
                'specialty' => $practice->specialty,
                'practice_model' => $practice->practice_model,
                'tenant_code' => $practice->tenant_code,
                'operator_id' => $practice->operator_id,
                // Branding — surfaced so the patient portal can theme its
                // header / accent color and show the practice logo. Both
                // are nullable; the portal falls back to the MemberMD
                // brand when absent.
                'logo_url' => $practice->logo_url,
                'primary_color' => $practice->primary_color,
                'tagline' => $practice->tagline,
                // Practice tz — used as a fallback when a provider hasn't
                // set their own tz, and as the anchor for billing /
                // admin reports that aren't patient-facing.
                'timezone' => $practice->timezone,
            ] : null,
            'operators' => $operators,
            'subscription' => $subscriptionSummary,
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
