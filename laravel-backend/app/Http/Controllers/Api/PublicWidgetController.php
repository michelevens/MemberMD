<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Models\TenantDomain;
use App\Models\WidgetConfig;
use App\Models\WidgetSubmission;
use App\Models\WidgetTheme;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicWidgetController extends Controller
{
    /**
     * GET /public/widget/resolve
     * Resolve the calling Host header to a tenant code so embedded widgets
     * served from a custom domain (e.g., enroll.acmedpc.com) can bootstrap
     * without a tenantCode in the URL.
     *
     * Returns 404 if the Host doesn't match any verified tenant domain.
     */
    public function resolveDomain(Request $request): JsonResponse
    {
        $host = $this->normalizeHost($request->getHost());
        if (!$host) {
            return response()->json(['error' => 'Host header required.'], 400);
        }

        $domain = TenantDomain::withoutGlobalScope('tenant')
            ->where('domain', $host)
            ->whereNotNull('verified_at')
            ->where('is_active', true)
            ->first();

        if (!$domain) {
            return response()->json(['error' => 'Domain not configured.'], 404);
        }

        $practice = Practice::where('id', $domain->tenant_id)->where('is_active', true)->first();
        if (!$practice) {
            return response()->json(['error' => 'Practice inactive.'], 404);
        }

        return response()->json([
            'data' => [
                'tenant_code' => $practice->tenant_code,
                'practice_name' => $practice->name,
                'domain' => $domain->domain,
            ],
        ]);
    }

    /**
     * GET /public/widget/{tenantCode}/theme
     * Resolved theme variables + custom CSS for the given tenant. Used by
     * embeddable widgets to apply branded styling at runtime.
     */
    public function theme(string $tenantCode, Request $request): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $scope = $request->query('scope', WidgetTheme::SCOPE_ALL);
        if (!in_array($scope, WidgetTheme::SCOPES, true)) {
            $scope = WidgetTheme::SCOPE_ALL;
        }

        // Look for a scope-specific theme first, then fall back to "all"
        $theme = WidgetTheme::withoutGlobalScope('tenant')
            ->where('tenant_id', $practice->id)
            ->where('scope', $scope)
            ->first();

        if (!$theme && $scope !== WidgetTheme::SCOPE_ALL) {
            $theme = WidgetTheme::withoutGlobalScope('tenant')
                ->where('tenant_id', $practice->id)
                ->where('scope', WidgetTheme::SCOPE_ALL)
                ->first();
        }

        return response()->json([
            'data' => [
                'tenant_code' => $tenantCode,
                'practice_name' => $practice->name,
                'logo_url' => $practice->logo_url,
                'css_variables' => $theme ? $theme->resolvedVariables() : WidgetTheme::defaults(),
                'custom_css' => $theme?->custom_css,
                'font_family' => $theme?->font_family,
                'logo' => $theme?->logo,
            ],
        ]);
    }

    private function normalizeHost(?string $host): ?string
    {
        if (!$host) return null;
        $host = strtolower($host);
        // Strip port if present
        if (str_contains($host, ':')) {
            $host = explode(':', $host, 2)[0];
        }
        return $host ?: null;
    }

    /**
     * GET /public/widget/{tenantCode}/{type}
     * Return widget config + practice name (no auth).
     */
    public function config(string $tenantCode, string $type): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $config = WidgetConfig::withoutGlobalScope('tenant')
            ->where('tenant_id', $practice->id)
            ->where('type', $type)
            ->where('is_active', true)
            ->first();

        if (!$config) {
            return response()->json(['error' => 'Widget not found or inactive'], 404);
        }

        return response()->json([
            'data' => [
                'practice_name' => $practice->name,
                'type' => $config->type,
                'name' => $config->name,
                'settings' => $config->settings,
            ],
        ]);
    }

    /**
     * POST /public/widget/{tenantCode}/{type}/submit
     * Accept form submission (no auth). Checks honeypot and domain allowlist.
     */
    public function submit(Request $request, string $tenantCode, string $type): JsonResponse
    {
        // Honeypot check — bots fill the hidden field
        if ($request->filled('website_url')) {
            return response()->json(['message' => 'Thank you for your submission!']);
        }

        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $config = WidgetConfig::withoutGlobalScope('tenant')
            ->where('tenant_id', $practice->id)
            ->where('type', $type)
            ->where('is_active', true)
            ->first();

        if (!$config) {
            return response()->json(['error' => 'Widget not found or inactive'], 404);
        }

        // Domain allowlist check via Referer header
        if (!empty($config->allowed_domains)) {
            $referer = $request->header('Referer');
            $refererHost = $referer ? parse_url($referer, PHP_URL_HOST) : null;
            $allowed = false;

            foreach ($config->allowed_domains as $domain) {
                if ($refererHost && (
                    $refererHost === $domain ||
                    str_ends_with($refererHost, '.' . $domain)
                )) {
                    $allowed = true;
                    break;
                }
            }

            if (!$allowed) {
                return response()->json(['error' => 'Submission not allowed from this domain'], 403);
            }
        }

        $validated = $request->validate([
            'data' => 'required|array',
        ]);

        $submission = WidgetSubmission::withoutGlobalScope('tenant')->create([
            'widget_config_id' => $config->id,
            'tenant_id' => $practice->id,
            'type' => $type,
            'data' => $validated['data'],
            'status' => 'pending',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'referrer_url' => $request->header('Referer'),
        ]);

        // Send applicant acknowledgement email when the submission carries
        // an email address. Best-effort — never blocks the widget response.
        $applicantEmail = $validated['data']['email']
            ?? $validated['data']['applicant_email']
            ?? $validated['data']['contact_email']
            ?? null;
        if ($applicantEmail && filter_var($applicantEmail, FILTER_VALIDATE_EMAIL)) {
            try {
                $applicantName = $validated['data']['first_name']
                    ?? $validated['data']['firstName']
                    ?? $validated['data']['name']
                    ?? null;
                \App\Services\MailDispatcher::send(
                    $applicantEmail,
                    new \App\Mail\WidgetSubmissionReceivedEmail(
                        practice: $practice,
                        submissionType: $type,
                        applicantName: is_string($applicantName) ? $applicantName : null,
                    ),
                    'widget-submission-received',
                );
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Widget submission ack email failed', [
                    'submission_id' => $submission->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // Notify the practice's admins so they can review the new
        // submission. Pulls the same superadmin-style notification
        // routing pattern: every active practice_admin user.
        try {
            $admins = \App\Models\User::where('tenant_id', $practice->id)
                ->where('role', 'practice_admin')
                ->where('status', 'active')
                ->get();
            foreach ($admins as $admin) {
                if (!$admin->email) continue;
                \App\Services\MailDispatcher::send(
                    $admin->email,
                    new \App\Mail\NewWidgetSubmissionEmail(
                        practice: $practice,
                        submissionType: $type,
                        submissionData: $validated['data'],
                    ),
                    'widget-submission-new',
                );
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Widget submission practice notification failed', [
                'submission_id' => $submission->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'message' => $config->settings['success_message'] ?? 'Thank you for your submission!',
            'submission_id' => $submission->id,
        ], 201);
    }
}
