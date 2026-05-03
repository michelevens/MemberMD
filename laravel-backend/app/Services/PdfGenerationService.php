<?php

namespace App\Services;

use App\Models\ConsentSignature;
use App\Models\ConsentTemplate;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use Barryvdh\DomPDF\Facade\Pdf;

/**
 * Renders signed agreements + consents to PDF.
 *
 * Two flavors:
 *   - signedAgreementPdf(ConsentSignature): a single signed consent or
 *     membership agreement, rendered with the snapshotted version's body
 *     plus signature/timestamp/IP block.
 *   - membershipAgreementPdf(PatientMembership): the DPC membership
 *     contract specifically — combines the plan's agreement_template
 *     with the plan's entitlements interpolated in.
 *
 * Output is binary PDF bytes; controllers wrap with appropriate
 * Response::download or Stream.
 *
 * The HTML view at resources/views/pdf/agreement.blade.php receives a
 * uniform $data structure regardless of which flavor — keeps the styling
 * coherent.
 */
class PdfGenerationService
{
    public function signedAgreementPdf(ConsentSignature $signature): string
    {
        $template = ConsentTemplate::find($signature->template_id);
        $patient = Patient::find($signature->patient_id);
        $practice = Practice::find($signature->tenant_id);
        $membership = $signature->membership_id
            ? PatientMembership::with('plan')->find($signature->membership_id)
            : null;

        return $this->render([
            'document_title' => $template->name ?? 'Signed Agreement',
            'practice' => $practice,
            'patient' => $patient,
            'membership' => $membership,
            'template_name' => $template->name ?? 'Agreement',
            'template_type' => $template->type ?? 'consent',
            'template_version' => $signature->template_version ?? $template->versionInt() ?? 1,
            'content_html' => $this->markdownToHtml((string) ($template->content ?? '')),
            'signature_data' => $signature->signature_data,
            'signature_type' => $signature->signature_type,
            'signed_at' => $signature->signed_at,
            'ip_address' => $signature->ip_address,
            'user_agent' => $signature->user_agent ?? null,
            'plan_entitlements' => $this->planEntitlementSummary($membership?->plan),
        ]);
    }

    public function membershipAgreementPdf(PatientMembership $membership): string
    {
        $plan = $membership->plan ?? MembershipPlan::find($membership->plan_id);
        $patient = $membership->patient ?? Patient::find($membership->patient_id);
        $practice = Practice::find($membership->tenant_id);
        $template = $plan?->agreement_template_id
            ? ConsentTemplate::find($plan->agreement_template_id)
            : null;

        // Find the most recent signed agreement for this membership, if any.
        $signature = ConsentSignature::where('membership_id', $membership->id)
            ->where('template_id', $template?->id)
            ->latest('signed_at')
            ->first();

        return $this->render([
            'document_title' => 'Membership Agreement',
            'practice' => $practice,
            'patient' => $patient,
            'membership' => $membership,
            'template_name' => $template?->name ?? 'Membership Agreement',
            'template_type' => 'membership_agreement',
            'template_version' => $signature?->template_version ?? $template?->versionInt() ?? 1,
            'content_html' => $this->markdownToHtml((string) ($template->content ?? $this->fallbackAgreementContent($plan))),
            'signature_data' => $signature?->signature_data,
            'signature_type' => $signature?->signature_type ?? 'typed',
            'signed_at' => $signature?->signed_at,
            'ip_address' => $signature?->ip_address,
            'user_agent' => $signature?->user_agent ?? null,
            'plan_entitlements' => $this->planEntitlementSummary($plan),
        ]);
    }

    private function render(array $data): string
    {
        // Templated single-source HTML — DomPDF turns it into PDF bytes.
        $pdf = Pdf::loadView('pdf.agreement', $data);
        $pdf->setPaper('letter', 'portrait');
        return $pdf->output();
    }

    /**
     * Light Markdown → HTML conversion. We don't want a full Markdown
     * library dependency just for headings + paragraphs + bold/italic;
     * legal documents are mostly plain prose with section headings.
     * Anything more elaborate than this is fine to render as plain text.
     */
    private function markdownToHtml(string $md): string
    {
        if ($md === '') return '';

        // Escape HTML first so patient/admin content can't inject markup.
        $html = e($md);

        // Headings
        $html = preg_replace('/^### (.+)$/m', '<h3>$1</h3>', $html);
        $html = preg_replace('/^## (.+)$/m', '<h2>$1</h2>', $html);
        $html = preg_replace('/^# (.+)$/m', '<h1>$1</h1>', $html);

        // Bold + italic
        $html = preg_replace('/\*\*(.+?)\*\*/s', '<strong>$1</strong>', $html);
        $html = preg_replace('/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/s', '<em>$1</em>', $html);

        // Paragraphs from blank-line-separated blocks
        $blocks = preg_split('/\n\s*\n/', $html);
        $html = collect($blocks)
            ->map(function ($b) {
                $b = trim($b);
                if ($b === '') return '';
                if (preg_match('/^<h[1-6]/', $b)) return $b;
                return '<p>' . str_replace("\n", '<br>', $b) . '</p>';
            })
            ->filter()
            ->implode("\n");

        return $html;
    }

    private function planEntitlementSummary(?MembershipPlan $plan): array
    {
        if (!$plan) return [];
        $items = [];

        $visits = (int) ($plan->visits_per_month ?? 0);
        $items[] = [
            'label' => 'Visits per month',
            'value' => $visits === -1 ? 'Unlimited' : (string) $visits,
        ];

        if ($plan->telehealth_included) {
            $items[] = ['label' => 'Telehealth', 'value' => 'Included'];
        }
        if ($plan->messaging_included) {
            $items[] = [
                'label' => 'Secure messaging',
                'value' => 'Included' . ($plan->messaging_response_sla_hours ? " (≤{$plan->messaging_response_sla_hours}h response)" : ''),
            ];
        }
        if ($plan->crisis_support) $items[] = ['label' => '24/7 crisis support', 'value' => 'Included'];
        if ($plan->prescription_management) $items[] = ['label' => 'Prescription management', 'value' => 'Included'];
        if ($plan->specialist_referrals) $items[] = ['label' => 'Specialist referrals', 'value' => 'Included'];
        if ($plan->care_plan_included) $items[] = ['label' => 'Personalized care plan', 'value' => 'Included'];
        if ((int) $plan->lab_discount_pct > 0) {
            $items[] = ['label' => 'Lab discount', 'value' => "{$plan->lab_discount_pct}%"];
        }
        if ($plan->visit_rollover) {
            $items[] = ['label' => 'Visit rollover', 'value' => 'Yes'];
        }
        if ((float) $plan->overage_fee > 0) {
            $items[] = ['label' => 'Overage fee per visit', 'value' => '$' . number_format((float) $plan->overage_fee, 2)];
        }
        if ($plan->family_eligible) {
            $items[] = [
                'label' => 'Family pricing',
                'value' => $plan->family_member_price ? '$' . number_format((float) $plan->family_member_price, 2) . ' / additional member' : 'Available',
            ];
        }
        // One-time fees charged at enrollment (in addition to recurring).
        // Surfaced in the agreement so the patient can't be surprised by
        // a charge they weren't told about.
        if ((float) ($plan->enrollment_fee ?? 0) > 0) {
            $items[] = [
                'label' => 'One-time enrollment fee',
                'value' => '$' . number_format((float) $plan->enrollment_fee, 2),
            ];
        }
        if ((float) ($plan->intake_fee ?? 0) > 0) {
            $items[] = [
                'label' => 'One-time intake fee',
                'value' => '$' . number_format((float) $plan->intake_fee, 2),
            ];
        }
        if ((int) ($plan->min_commitment_months ?? 0) > 0) {
            $items[] = [
                'label' => 'Minimum commitment',
                'value' => $plan->min_commitment_months . ' month' . ($plan->min_commitment_months > 1 ? 's' : ''),
            ];
        }

        return $items;
    }

    /**
     * Fallback membership agreement content if a plan has no
     * agreement_template_id set. Generic DPC contract language with
     * placeholders interpolated from plan + practice.
     */
    private function fallbackAgreementContent(?MembershipPlan $plan): string
    {
        $planName = $plan?->name ?? 'Membership';
        $monthly = number_format((float) ($plan?->monthly_price ?? 0), 2);

        return <<<MD
# Direct Primary Care Membership Agreement

This Agreement is entered into between the Patient (the "Member") and
the Practice for participation in a direct primary care membership
program ("Membership") under the **{$planName}** plan.

## 1. Services Included

The Member is entitled to the services listed in the plan entitlements
table at the end of this Agreement. Services are provided directly by
the Practice and are NOT billed to insurance.

## 2. Membership Fee

The Member agrees to pay a recurring membership fee of \${$monthly} per
month (or the annual equivalent if applicable). The fee is charged
automatically to the payment method on file at the start of each
billing period.

## 3. Term and Termination

This Agreement begins on the Member's enrollment date and continues
month-to-month (or annually for annual subscribers). Either party may
terminate with notice consistent with the plan's cancellation terms.

## 4. Not Insurance

This Membership is NOT health insurance. The Member acknowledges that
the Practice does not bill health insurance for services covered under
this Membership and that the Member is responsible for maintaining
appropriate health insurance for hospital, emergency, and specialist
care not provided by the Practice.

## 5. Refund Policy

Membership fees are generally non-refundable except as required by
state law or as specifically provided in this Agreement.

## 6. Governing Law

This Agreement is governed by the laws of the state in which the
Practice is licensed.

By signing below, the Member acknowledges receipt of this Agreement,
has had an opportunity to ask questions, and agrees to be bound by
its terms.
MD;
    }
}
