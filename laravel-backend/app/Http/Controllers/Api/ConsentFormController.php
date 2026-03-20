<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsentFormTemplate;
use App\Models\ConsentSignature;
use App\Models\Patient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ConsentFormController extends Controller
{
    /**
     * List active consent form templates (system-wide + practice-specific).
     */
    public function templates(Request $request): JsonResponse
    {
        $user = $request->user();

        $templates = ConsentFormTemplate::where(function ($q) use ($user) {
                $q->whereNull('tenant_id')
                  ->orWhere('tenant_id', $user->tenant_id);
            })
            ->where('is_active', true)
            ->orderBy('category', 'asc')
            ->orderBy('title', 'asc')
            ->get();

        return response()->json(['data' => $templates]);
    }

    /**
     * Create a practice-specific consent form template (practice_admin only).
     */
    public function storeTemplate(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role !== 'practice_admin', 403, 'Only practice admins can create templates.');

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'body' => 'required|string',
            'category' => ['required', 'string', Rule::in(['general', 'telehealth', 'treatment', 'hipaa', 'financial'])],
            'requires_witness' => 'sometimes|boolean',
            'version' => 'sometimes|integer|min:1',
        ]);

        $template = ConsentFormTemplate::create([
            'tenant_id' => $user->tenant_id,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'body' => $validated['body'],
            'category' => $validated['category'],
            'requires_witness' => $validated['requires_witness'] ?? false,
            'version' => $validated['version'] ?? 1,
        ]);

        return response()->json(['data' => $template], 201);
    }

    /**
     * Update a consent form template.
     */
    public function updateTemplate(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403, 'Not authorized.');

        $template = ConsentFormTemplate::where(function ($q) use ($user) {
                $q->whereNull('tenant_id')
                  ->orWhere('tenant_id', $user->tenant_id);
            })
            ->findOrFail($id);

        // Non-superadmins can only edit their own practice templates
        if ($user->role !== 'superadmin' && $template->tenant_id !== $user->tenant_id) {
            abort(403, 'Cannot modify system templates.');
        }

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'body' => 'sometimes|string',
            'category' => ['sometimes', 'string', Rule::in(['general', 'telehealth', 'treatment', 'hipaa', 'financial'])],
            'is_active' => 'sometimes|boolean',
            'requires_witness' => 'sometimes|boolean',
            'version' => 'sometimes|integer|min:1',
        ]);

        $template->update($validated);

        return response()->json(['data' => $template->fresh()]);
    }

    /**
     * Sign a consent form template.
     * Accepts signature_data (base64 for drawn or text for typed), signature_method,
     * and automatically captures IP address and user agent.
     */
    public function sign(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'template_id' => 'required|uuid|exists:consent_form_templates,id',
            'signature_data' => 'required|string',
            'signature_method' => ['sometimes', Rule::in(['typed', 'drawn'])],
        ]);

        // Determine patient_id from authenticated user
        $patient = Patient::where('user_id', $user->id)->first();
        abort_if(!$patient, 403, 'Only patients can sign consent forms.');

        $signatureMethod = $validated['signature_method'] ?? 'typed';
        $signatureImageUrl = null;

        // For drawn signatures, store the base64 data as the image URL
        if ($signatureMethod === 'drawn') {
            $signatureImageUrl = $validated['signature_data'];
        }

        $consent = ConsentSignature::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $patient->id,
            'template_id' => $validated['template_id'],
            'signature_type' => $signatureMethod,
            'signature_data' => $validated['signature_data'],
            'signature_image_url' => $signatureImageUrl,
            'signed_at' => now(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['data' => $consent->load('template')], 201);
    }

    /**
     * List a patient's signed consents.
     */
    public function patientConsents(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();

        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($patientId);

        // Patients can only view their own consents
        if ($user->isPatient()) {
            abort_if($patient->user_id !== $user->id, 403, 'Not authorized.');
        }

        $consents = ConsentSignature::where('patient_id', $patientId)
            ->with('template')
            ->orderBy('signed_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $consents]);
    }
}
