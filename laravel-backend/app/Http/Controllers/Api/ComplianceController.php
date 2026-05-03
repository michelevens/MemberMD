<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsentSignature;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\TenantDomain;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Compliance Command Center — port from Credentik (Providus).
 *
 * Returns a single weighted compliance score (0–100) plus the
 * per-component breakdown so the practice can see exactly what to fix
 * first. Designed for the "audit-ready in one click" sales pitch:
 * compliance officers get a score, a risk matrix, and a list of action
 * items without having to dig through 8 tabs.
 *
 * Score weights (sum to 100):
 *  - 25  patient consents on file (HIPAA + treatment for every active member)
 *  - 20  provider data completeness (NPI, license, license_expiration)
 *  - 20  practice settings (npi, tax_id, address, phone)
 *  - 15  Stripe Connect status (active = 15, pending = 7, missing = 0)
 *  - 10  custom domain verified (helps brand trust + prevents phishing)
 *  - 10  email-verified user rate among practice staff
 *
 * Each component returns its current/max points + an "action" string
 * describing the smallest fix to bump that component.
 */
class ComplianceController extends Controller
{
    public function score(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'superadmin']), 403);

        $practice = Practice::findOrFail($user->tenant_id);

        $components = [];
        $components[] = $this->scorePatientConsents($practice);
        $components[] = $this->scoreProviderData($practice);
        $components[] = $this->scorePracticeSettings($practice);
        $components[] = $this->scoreStripeConnect($practice);
        $components[] = $this->scoreCustomDomain($practice);
        $components[] = $this->scoreEmailVerification($practice);

        $total = array_sum(array_column($components, 'score'));
        $max = array_sum(array_column($components, 'max'));
        $pct = $max > 0 ? round(($total / $max) * 100) : 0;

        $grade = match (true) {
            $pct >= 95 => 'A',
            $pct >= 85 => 'B',
            $pct >= 75 => 'C',
            $pct >= 60 => 'D',
            default => 'F',
        };

        // Sorted action queue: components that lost the most points first.
        $actions = collect($components)
            ->filter(fn ($c) => $c['score'] < $c['max'] && !empty($c['action']))
            ->sortByDesc(fn ($c) => $c['max'] - $c['score'])
            ->values()
            ->take(5)
            ->map(fn ($c) => [
                'component' => $c['name'],
                'action' => $c['action'],
                'lost_points' => $c['max'] - $c['score'],
            ])
            ->all();

        return response()->json([
            'data' => [
                'practice_id' => $practice->id,
                'score' => $pct,
                'grade' => $grade,
                'total_points' => $total,
                'max_points' => $max,
                'components' => $components,
                'top_actions' => $actions,
                'computed_at' => now()->toIso8601String(),
            ],
        ]);
    }

    private function scorePatientConsents(Practice $practice): array
    {
        $activePatients = Patient::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->whereHas('memberships', fn ($q) => $q->where('status', 'active'))
            ->pluck('id');

        if ($activePatients->isEmpty()) {
            // No active patients yet → can't fail compliance on consents
            // we don't need. Award full points.
            return [
                'name' => 'Patient consents',
                'description' => 'HIPAA + treatment consents on file for every active member.',
                'score' => 25, 'max' => 25,
                'detail' => 'No active patients yet.',
                'action' => null,
            ];
        }

        $totalNeeded = $activePatients->count() * 2; // hipaa + treatment
        $signed = ConsentSignature::where('tenant_id', $practice->id)
            ->whereIn('patient_id', $activePatients)
            ->whereHas('template', fn ($q) => $q->whereIn('type', ['hipaa', 'treatment']))
            ->count();

        $coverage = $totalNeeded > 0 ? min(1.0, $signed / $totalNeeded) : 1.0;
        $score = (int) round(25 * $coverage);
        $missing = max(0, $totalNeeded - $signed);

        return [
            'name' => 'Patient consents',
            'description' => 'HIPAA + treatment consents on file for every active member.',
            'score' => $score, 'max' => 25,
            'detail' => "{$signed} of {$totalNeeded} required signatures on file.",
            'action' => $missing > 0
                ? "Collect {$missing} missing HIPAA/treatment consent" . ($missing === 1 ? '' : 's')
                : null,
        ];
    }

    private function scoreProviderData(Practice $practice): array
    {
        $providers = Provider::where('tenant_id', $practice->id)->get();
        if ($providers->isEmpty()) {
            return [
                'name' => 'Provider data',
                'description' => 'NPI + license number on file for every provider.',
                'score' => 0, 'max' => 20,
                'detail' => 'No providers added yet.',
                'action' => 'Add at least one provider.',
            ];
        }

        $complete = $providers->filter(fn ($p) =>
            !empty($p->npi) && !empty($p->license_number)
        )->count();
        $missing = $providers->count() - $complete;
        $coverage = $providers->count() > 0 ? $complete / $providers->count() : 1.0;
        $score = (int) round(20 * $coverage);

        return [
            'name' => 'Provider data',
            'description' => 'NPI + license number on file for every provider.',
            'score' => $score, 'max' => 20,
            'detail' => "{$complete} of {$providers->count()} providers fully credentialed.",
            'action' => $missing > 0
                ? "Add NPI + license for {$missing} provider" . ($missing === 1 ? '' : 's')
                : null,
        ];
    }

    private function scorePracticeSettings(Practice $practice): array
    {
        $required = ['npi', 'tax_id', 'address', 'phone'];
        $filled = array_filter($required, fn ($f) => !empty($practice->{$f}));
        $missing = array_diff($required, $filled);
        $coverage = count($required) > 0 ? count($filled) / count($required) : 1.0;
        $score = (int) round(20 * $coverage);

        return [
            'name' => 'Practice profile',
            'description' => 'NPI, Tax ID, address, and phone on file.',
            'score' => $score, 'max' => 20,
            'detail' => count($filled) . ' of ' . count($required) . ' fields completed.',
            'action' => count($missing) > 0
                ? 'Fill in: ' . implode(', ', $missing)
                : null,
        ];
    }

    private function scoreStripeConnect(Practice $practice): array
    {
        $status = $practice->stripe_connect_status ?? 'not_started';
        [$score, $detail, $action] = match ($status) {
            'active' => [15, 'Stripe Connect active — payouts enabled.', null],
            'pending', 'pending_onboarding' => [7, 'Onboarding in progress.', 'Finish Stripe Connect onboarding to enable payouts.'],
            'failing', 'restricted' => [3, "Connect status: {$status}.", 'Resolve Stripe verification issues.'],
            default => [0, 'Stripe Connect not started.', 'Connect your Stripe account to accept payments.'],
        };
        return [
            'name' => 'Payment processing',
            'description' => 'Stripe Connect account is active and ready for payouts.',
            'score' => $score, 'max' => 15,
            'detail' => $detail,
            'action' => $action,
        ];
    }

    private function scoreCustomDomain(Practice $practice): array
    {
        $verified = TenantDomain::where('tenant_id', $practice->id)
            ->where('status', 'verified')
            ->exists();
        return [
            'name' => 'Custom domain',
            'description' => 'A verified custom domain reduces patient phishing risk.',
            'score' => $verified ? 10 : 0, 'max' => 10,
            'detail' => $verified ? 'Verified.' : 'No verified custom domain.',
            'action' => $verified ? null : 'Add and verify a custom domain in Branding settings.',
        ];
    }

    private function scoreEmailVerification(Practice $practice): array
    {
        $staff = \App\Models\User::where('tenant_id', $practice->id)
            ->whereIn('role', ['practice_admin', 'staff', 'provider'])
            ->get(['id', 'email_verified_at']);

        if ($staff->isEmpty()) {
            return [
                'name' => 'Staff email verification',
                'description' => 'All staff have verified their email address.',
                'score' => 0, 'max' => 10,
                'detail' => 'No staff users yet.',
                'action' => 'Invite staff and ensure they verify their emails.',
            ];
        }

        $verified = $staff->filter(fn ($u) => !empty($u->email_verified_at))->count();
        $coverage = $staff->count() > 0 ? $verified / $staff->count() : 1.0;
        $score = (int) round(10 * $coverage);
        $unverified = $staff->count() - $verified;

        return [
            'name' => 'Staff email verification',
            'description' => 'All staff have verified their email address.',
            'score' => $score, 'max' => 10,
            'detail' => "{$verified} of {$staff->count()} staff verified.",
            'action' => $unverified > 0
                ? "Resend verification to {$unverified} staff member" . ($unverified === 1 ? '' : 's')
                : null,
        ];
    }
}
