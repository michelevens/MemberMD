<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsentSignature;
use App\Models\PatientMembership;
use App\Services\PdfGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Read access to signed agreements + PDF generation.
 *
 * Patient endpoints (GET /consent-signatures, GET /consent-signatures/{id})
 * are scoped to the authenticated patient's records only — controllers
 * enforce ownership. Admin endpoints are scoped to the tenant. Both pull
 * from the same model with different filters.
 */
class ConsentSignatureController extends Controller
{
    public function __construct(
        private readonly PdfGenerationService $pdf,
    ) {
    }

    /**
     * GET /consent-signatures
     *
     * Patient role: their own signatures. Admin/staff role: any patient
     * in their tenant. Filterable by patient_id and template_id.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = ConsentSignature::with(['template:id,name,type,version,description', 'membership:id,plan_id,started_at']);

        if ($user->isPatient()) {
            $query->where('tenant_id', $user->tenant_id)
                  ->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        } elseif (in_array($user->role, ['practice_admin', 'staff', 'provider', 'superadmin'])) {
            $query->where('tenant_id', $user->tenant_id);
            if ($request->filled('patient_id')) {
                $query->where('patient_id', $request->input('patient_id'));
            }
        } else {
            abort(403);
        }

        if ($request->filled('template_id')) {
            $query->where('template_id', $request->input('template_id'));
        }
        if ($request->filled('membership_id')) {
            $query->where('membership_id', $request->input('membership_id'));
        }

        $signatures = $query->orderByDesc('signed_at')->get();
        return response()->json(['data' => $signatures]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $signature = $this->findAccessible($request, $id);
        $signature->load(['template', 'membership.plan']);
        return response()->json(['data' => $signature]);
    }

    /**
     * GET /consent-signatures/{id}/pdf
     *
     * Streams the rendered PDF. The patient who signed and any admin/staff
     * in the same tenant can download. Filename is derived from the
     * template name + signed date.
     */
    public function downloadPdf(Request $request, string $id): StreamedResponse
    {
        $signature = $this->findAccessible($request, $id);
        $bytes = $this->pdf->signedAgreementPdf($signature);

        $template = $signature->template;
        $patient = $signature->patient;
        $filename = sprintf(
            '%s - %s - %s.pdf',
            $template?->name ?? 'Agreement',
            $patient ? "{$patient->first_name}_{$patient->last_name}" : 'Patient',
            $signature->signed_at?->format('Y-m-d') ?? 'undated',
        );

        return response()->streamDownload(
            fn () => print($bytes),
            $filename,
            ['Content-Type' => 'application/pdf'],
        );
    }

    /**
     * GET /memberships/{id}/agreement-pdf
     *
     * Generates the membership agreement PDF for a specific membership
     * (with the plan's bound agreement template + interpolated entitlements).
     * If the membership hasn't been signed yet, returns the template
     * content with an empty signature block — useful as a preview.
     */
    public function membershipAgreementPdf(Request $request, string $membershipId): StreamedResponse
    {
        $user = $request->user();

        $query = PatientMembership::with(['plan', 'patient']);
        if ($user->isPatient()) {
            $query->where('tenant_id', $user->tenant_id)
                  ->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        } else {
            abort_if(!in_array($user->role, ['practice_admin', 'staff', 'provider', 'superadmin']), 403);
            $query->where('tenant_id', $user->tenant_id);
        }
        $membership = $query->findOrFail($membershipId);

        $bytes = $this->pdf->membershipAgreementPdf($membership);

        $patient = $membership->patient;
        $filename = sprintf(
            'Membership Agreement - %s - %s.pdf',
            $patient ? "{$patient->first_name}_{$patient->last_name}" : 'Patient',
            $membership->started_at?->format('Y-m-d') ?? 'pending',
        );

        return response()->streamDownload(
            fn () => print($bytes),
            $filename,
            ['Content-Type' => 'application/pdf'],
        );
    }

    /**
     * Resolve a signature by id with the right access scope:
     *   - Patient: must own it (signature.patient.user_id = user.id)
     *   - Admin/staff/provider/superadmin: must be in the same tenant
     */
    private function findAccessible(Request $request, string $id): ConsentSignature
    {
        $user = $request->user();
        $query = ConsentSignature::query();

        if ($user->isPatient()) {
            $query->where('tenant_id', $user->tenant_id)
                  ->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        } else {
            abort_if(!in_array($user->role, ['practice_admin', 'staff', 'provider', 'superadmin']), 403);
            $query->where('tenant_id', $user->tenant_id);
        }

        return $query->findOrFail($id);
    }
}
