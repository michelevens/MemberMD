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

        $this->dispatchEmail($req->fresh(['template', 'patient']));

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

    public function publicSign(Request $request, string $token): JsonResponse
    {
        $data = $request->validate([
            'signature_data' => 'required|string|max:200000',
            // 'drawn' (canvas dataURL) or 'typed' (typed full name).
            'signature_type' => 'required|string|in:drawn,typed',
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

        // Snapshot the template version so future template edits don't
        // retroactively change what the patient signed.
        $signature = ConsentSignature::create([
            'tenant_id' => $req->tenant_id,
            'patient_id' => $req->patient_id,
            'template_id' => $template->id,
            'template_version' => (string) ($template->versionInt() ?? '1'),
            'membership_id' => $req->membership_id,
            'signature_type' => $data['signature_type'],
            'signature_data' => $data['signature_data'],
            'signed_at' => now(),
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
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

    // ─── Helpers ─────────────────────────────────────────────────────────

    private function dispatchEmail(SignatureRequest $req): void
    {
        try {
            $patient = $req->patient;
            $template = $req->template;
            $practice = Practice::find($req->tenant_id);
            if (!$patient || !$patient->email || !$template || !$practice) return;

            $appUrl = (string) config('app.frontend_url', config('app.url', 'https://app.membermd.io'));
            $signUrl = rtrim($appUrl, '/') . '/#/sign/' . $req->public_token;

            Mail::to($patient->email)->send(new SignatureRequestEmail(
                practice: $practice,
                patient: $patient,
                template: $template,
                signUrl: $signUrl,
                personalNote: $req->message,
            ));
        } catch (Throwable $e) {
            Log::warning('Signature request email failed', [
                'request_id' => $req->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
