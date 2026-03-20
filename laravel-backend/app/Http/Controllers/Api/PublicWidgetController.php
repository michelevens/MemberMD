<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Models\WidgetConfig;
use App\Models\WidgetSubmission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicWidgetController extends Controller
{
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

        return response()->json([
            'message' => $config->settings['success_message'] ?? 'Thank you for your submission!',
            'submission_id' => $submission->id,
        ], 201);
    }
}
