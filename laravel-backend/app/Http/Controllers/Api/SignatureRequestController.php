<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\SignatureRequestEmail;
use App\Models\ConsentSignature;
use App\Models\ConsentTemplate;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\SignatureRequest;
use App\Services\AuditEnrichmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Practice-initiated e-signature requests + the public token-signed
 * fulfillment endpoint.
 *
 * Flow:
 *   1. Practice POST /signature-requests with template_id + patient_id
 *      → creates a pending request and emails the patient a sign link
 *   2. Patient opens link → GET /public/signature-requests/{token}
 *      returns the template + patient name (read-only preview)
 *   3. Patient submits signature → POST /public/signature-requests/{token}/sign
 *      creates a ConsentSignature row, marks request signed, emails practice
 *
 * The patient's portal also lists their pending requests via
 * GET /me/signature-requests so they can sign in-app without leaving
 * the portal.
 */
class SignatureRequestController extends Controller
{
    // ─── Practice-side: create a request ─────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'provider', 'superadmin']), 403);

        $query = SignatureRequest::where('tenant_id', $user->tenant_id)
            ->with(['template:id,name,type,version', 'patient:id,first_name,last_name,email']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        $rows = $query->orderByDesc('created_at')->limit(200)->get();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $data = $request->validate([
            'template_id' => 'required|uuid|exists:consent_templates,id',
            'patient_id' => 'required|uuid|exists:patients,id',
            'membership_id' => 'nullable|uuid|exists:patient_memberships,id',
            'message' => 'nullable|string|max:1000',
            // Default 30-day window. Pass null to make it never expire.
            'expires_in_days' => 'sometimes|nullable|integer|min:1|max:365',
        ]);

        // Validate cross-tenant.
        $template = ConsentTemplate::where(function ($q) use ($user) {
                $q->where('tenant_id', $user->tenant_id)->orWhereNull('tenant_id');
            })
            ->where('id', $data['template_id'])
            ->where('is_active', true)
            ->first();
        if (!$template) {
            return response()->json(['message' => 'Template not found.'], 422);
        }

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->findOrFail($data['patient_id']);

        if (empty($patient->email)) {
            return response()->json([
                'message' => 'Patient has no email on file — cannot send signature link.',
            ], 422);
        }

        $expiresInDays = array_key_exists('expires_in_days', $data) ? $data['expires_in_days'] : 30;
        $req = SignatureRequest::create([
            'tenant_id' => $user->tenant_id,
            'template_id' => $template->id,
            'patient_id' => $patient->id,
            'membership_id' => $data['membership_id'] ?? null,
            'requested_by_user_id' => $user->id,
            'message' => $data['message'] ?? null,
            'status' => SignatureRequest::STATUS_PENDING,
            'expires_at' => $expiresInDays ? now()->addDays($expiresInDays) : null,
        ]);

        $req = $req->fresh(['template', 'patient']);
        $this->dispatchEmail($req);

        // In-app notification to the patient (email is primary; this
        // ensures the patient sees a bell-badge entry next time they
        // open the portal even if the email is missed).
        try {
            if ($patient->user_id) {
                $patientUser = \App\Models\User::find($patient->user_id);
                if ($patientUser) {
                    $patientUser->notify(new \App\Notifications\SignatureRequestReceived($req));
                }
            }
        } catch (Throwable $e) {
            Log::warning('Signature-request in-app notification failed', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'data' => $req->load(['template:id,name,type,version', 'patient:id,first_name,last_name,email']),
            'message' => "Signature request sent to {$patient->email}.",
        ], 201);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $req = SignatureRequest::where('tenant_id', $user->tenant_id)->findOrFail($id);
        if ($req->status !== SignatureRequest::STATUS_PENDING) {
            return response()->json(['message' => 'Only pending requests can be cancelled.'], 422);
        }
        $req->update(['status' => SignatureRequest::STATUS_CANCELLED]);
        return response()->json(['data' => $req, 'message' => 'Cancelled.']);
    }

    public function resend(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $req = SignatureRequest::where('tenant_id', $user->tenant_id)
            ->with(['template', 'patient'])
            ->findOrFail($id);
        if ($req->status !== SignatureRequest::STATUS_PENDING) {
            return response()->json(['message' => 'Only pending requests can be resent.'], 422);
        }
        $this->dispatchEmail($req);
        $req->update(['reminded_at' => now()]);
        return response()->json(['data' => $req, 'message' => 'Reminder sent.']);
    }

    // ─── Patient-side: list mine ─────────────────────────────────────────

    public function mine(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role !== 'patient', 403);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->first();
        if (!$patient) return response()->json(['data' => []]);

        $rows = SignatureRequest::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patient->id)
            ->where('status', SignatureRequest::STATUS_PENDING)
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->with(['template:id,name,type,version,content,description'])
            ->orderBy('created_at')
            ->get();

        return response()->json(['data' => $rows]);
    }

    // ─── Public token-signed flow ────────────────────────────────────────

    public function publicShow(string $token): JsonResponse
    {
        $req = SignatureRequest::where('public_token', $token)
            ->with(['template:id,name,type,version,content,description', 'patient:id,first_name,last_name,email'])
            ->first();
        if (!$req) return response()->json(['message' => 'Link not found.'], 404);
        if (!$req->isPending()) {
            return response()->json([
                'message' => 'This signature link is no longer active.',
                'status' => $req->status,
            ], 410);
        }

        // Stamp first-open time. We deliberately don't update on every
        // load so the timestamp reflects the patient's first interaction.
        if ($req->link_opened_at === null) {
            $req->update(['link_opened_at' => now()]);
        }

        $practice = Practice::find($req->tenant_id);
        return response()->json([
            'data' => [
                'id' => $req->id,
                'status' => $req->status,
                'message' => $req->message,
                'expires_at' => $req->expires_at,
                'practice_name' => $practice?->name,
                'practice_logo_url' => $practice?->logo_url,
                'template' => $req->template,
                'patient' => [
                    'first_name' => $req->patient?->first_name,
                    'last_name' => $req->patient?->last_name,
                ],
            ],
        ]);
    }

    public function publicSign(Request $request, string $token, AuditEnrichmentService $enricher): JsonResponse
    {
        $data = $request->validate([
            'signature_data' => 'required|string|max:200000',
            // 'drawn' (canvas dataURL) or 'typed' (typed full name).
            'signature_type' => 'required|string|in:drawn,typed',
            // Audit context captured client-side. All optional and
            // bounded — we never trust these for auth, only for the
            // audit trail.
            'timezone' => 'sometimes|nullable|string|max:64',
            'tz_offset_minutes' => 'sometimes|nullable|integer|min:-840|max:840',
        ]);

        $req = SignatureRequest::where('public_token', $token)
            ->with(['template', 'patient'])
            ->first();
        if (!$req) return response()->json(['message' => 'Link not found.'], 404);
        if (!$req->isPending()) {
            return response()->json([
                'message' => 'This signature link is no longer active.',
                'status' => $req->status,
            ], 410);
        }

        $template = $req->template;
        if (!$template) return response()->json(['message' => 'Template missing.'], 422);

        // Hash the rendered content the patient saw, so future edits
        // can't retroactively rewrite the agreement. Stored alongside
        // template_version (which is just a counter).
        $contentHash = hash('sha256', (string) $template->content);

        // Server-side enrichment — fail-soft on any error.
        $ua = (string) $request->userAgent();
        $parsed = $enricher->parseUserAgent($ua);
        $geo = $enricher->geolocate($request->ip());

        $signature = ConsentSignature::create([
            'tenant_id' => $req->tenant_id,
            'patient_id' => $req->patient_id,
            'template_id' => $template->id,
            'template_version' => (string) ($template->versionInt() ?? '1'),
            'template_content_hash' => $contentHash,
            'membership_id' => $req->membership_id,
            'signature_type' => $data['signature_type'],
            'signature_data' => $data['signature_data'],
            'signed_at' => now(),
            'signed_timezone' => $data['timezone'] ?? null,
            'signed_tz_offset_minutes' => $data['tz_offset_minutes'] ?? null,
            'ip_address' => $request->ip(),
            'signed_country' => $geo['country'],
            'signed_region' => $geo['region'],
            'signed_city' => $geo['city'],
            'user_agent' => substr($ua, 0, 255),
            'device_type' => $parsed['device_type'],
            'browser_name' => $parsed['browser_name'],
            'browser_version' => $parsed['browser_version'],
            'os_name' => $parsed['os_name'],
        ]);

        $req->update([
            'status' => SignatureRequest::STATUS_SIGNED,
            'signed_at' => now(),
            'consent_signature_id' => $signature->id,
        ]);

        // Notify the practice that the patient signed.
        try {
            $practice = Practice::find($req->tenant_id);
            $admins = \App\Models\User::where('tenant_id', $req->tenant_id)
                ->whereIn('role', ['practice_admin', 'staff'])
                ->where('status', 'active')
                ->get();
            foreach ($admins as $admin) {
                $admin->notify(new \App\Notifications\SignatureRequestSigned(
                    request: $req->fresh(),
                    practice: $practice,
                ));
            }
        } catch (Throwable $e) {
            Log::warning('Signature-signed notification failed', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'data' => [
                'signed_at' => $req->signed_at,
                'consent_signature_id' => $signature->id,
            ],
            'message' => 'Signature recorded. Thank you.',
        ]);
    }

    /**
     * POST /external/signature-requests/{token}/viewed
     *
     * Called by the SignatureWidget when the patient scrolls the
     * agreement body to the bottom. Stamps viewed_at on first hit;
     * subsequent calls are no-ops. Strongest defense against the
     * "I never read it" claim.
     */
    public function publicMarkViewed(string $token): JsonResponse
    {
        $req = SignatureRequest::where('public_token', $token)->first();
        if (!$req) return response()->json(['message' => 'Link not found.'], 404);
        if (!$req->isPending()) {
            return response()->json(['message' => 'No longer active.'], 410);
        }
        if ($req->viewed_at === null) {
            $req->update(['viewed_at' => now()]);
        }
        return response()->json(['data' => ['viewed_at' => $req->viewed_at]]);
    }

    /**
     * POST /consent-signatures/{id}/revoke
     *
     * Admin-only — marks a signed consent as revoked. We don't delete
     * (audit trail must show consent was active from signed_at to
     * revoked_at). Only the signed-and-not-yet-revoked rows are
     * eligible to flip.
     */
    public function revoke(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $data = $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        $sig = ConsentSignature::where('tenant_id', $user->tenant_id)->findOrFail($id);
        if ($sig->revoked_at !== null) {
            return response()->json([
                'message' => 'This consent has already been revoked.',
                'revoked_at' => $sig->revoked_at,
            ], 422);
        }

        $sig->update([
            'revoked_at' => now(),
            'revoked_reason' => $data['reason'],
            'revoked_by_user_id' => $user->id,
        ]);

        return response()->json([
            'data' => $sig->fresh(),
            'message' => 'Consent revoked. The patient will see this on their consents list.',
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    private function dispatchEmail(SignatureRequest $req): void
    {
        try {
            $patient = $req->patient;
            $template = $req->template;
            $practice = Practice::find($req->tenant_id);
            if (!$patient || !$patient->email || !$template || !$practice) return;

            // Registry gate — respect tenant-level toggle. PHI consent
            // is not gated for this key (signature_request is non-PHI per
            // registry), so the gate is effectively just the tenant
            // toggle here. We do the inline check (instead of going
            // through MailDispatcher::send) because we need the
            // SentMessage return value to extract Resend's email_id for
            // delivery-proof matching in the webhook.
            $gate = \App\Services\NotificationRegistry::shouldSend(
                'patient.signature_request',
                $req->tenant_id,
                $patient->id,
            );
            if (!$gate['allow']) {
                Log::info('Signature request email suppressed by registry', [
                    'request_id' => $req->id,
                    'reason' => $gate['reason'],
                ]);
                return;
            }

            $appUrl = (string) config('app.frontend_url', config('app.url', 'https://app.membermd.io'));
            $signUrl = rtrim($appUrl, '/') . '/#/sign/' . $req->public_token;

            $sent = Mail::to($patient->email)->send(new SignatureRequestEmail(
                practice: $practice,
                patient: $patient,
                template: $template,
                signUrl: $signUrl,
                personalNote: $req->message,
            ));

            // Resend's transport stamps the message id on the
            // SentMessage. Persist it so the webhook can match
            // delivery/open/click events back to this row.
            try {
                $emailId = $this->extractResendId($sent);
                if ($emailId !== null) {
                    $req->update(['email_id' => $emailId]);
                }
            } catch (Throwable $e) {
                // Non-fatal — the email was still sent, we just lose
                // the delivery-proof linkage for this send.
                Log::info('Could not extract Resend email id', [
                    'request_id' => $req->id,
                    'error' => $e->getMessage(),
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('Signature request email failed', [
                'request_id' => $req->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function extractResendId(mixed $sent): ?string
    {
        // Mail::send() returns a SentMessage in modern Laravel
        // (or null on certain transports). The Symfony message has
        // an "X-Resend-Email-ID" or similar header set by the
        // resend-laravel transport.
        if (!$sent) return null;
        $sym = method_exists($sent, 'getSymfonySentMessage')
            ? $sent->getSymfonySentMessage()
            : null;
        if (!$sym) return null;
        $headers = $sym->getOriginalMessage()?->getHeaders();
        if (!$headers) return null;
        foreach (['x-resend-email-id', 'resend-email-id', 'x-message-id'] as $hk) {
            if ($headers->has($hk)) {
                $v = $headers->get($hk)?->getBodyAsString();
                if ($v) return trim($v);
            }
        }
        // Fallback to the Resend-issued message-id which the transport
        // typically writes to the "Message-ID" header.
        if ($headers->has('Message-ID')) {
            $v = $headers->get('Message-ID')?->getBodyAsString();
            if ($v) return trim($v, " \t<>");
        }
        return null;
    }
}
