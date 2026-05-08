<?php

namespace App\Mail;

use App\Models\PatientMembership;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class MembershipActivated extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly PatientMembership $membership,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Welcome — your membership is active!');
    }

    public function content(): Content
    {
        $m = $this->membership;
        $m->loadMissing([
            'plan',
            'patient',
            // Eager-load entitlements + their type so the template can
            // render "Office visits — 4 / month" without N+1 queries
            // running per row inside the Blade loop.
            'plan.planEntitlements' => function ($q) {
                $q->where('is_active', true)->orderBy('sort_order');
            },
            'plan.planEntitlements.entitlementType',
        ]);

        // Format entitlements into a flat array of {label, allowance,
        // notes} the template can render verbatim. Keep formatting in
        // PHP rather than Blade so the same logic is unit-testable and
        // future SMS / push surfaces can reuse it.
        $entitlements = ($m->plan?->planEntitlements ?? collect())
            ->filter(fn ($pe) => $pe->entitlementType !== null)
            ->map(function ($pe) {
                $type = $pe->entitlementType;
                $unit = $type->unit_of_measure ?? 'unit';
                $period = match ($pe->period_type) {
                    'per_month' => 'per month',
                    'per_year' => 'per year',
                    'per_quarter' => 'per quarter',
                    'per_lifetime' => 'lifetime',
                    default => '',
                };
                if ($pe->is_unlimited) {
                    $allowance = 'Unlimited';
                } elseif ($pe->quantity_limit !== null) {
                    $unitLabel = $pe->quantity_limit === 1
                        ? $unit
                        : \Illuminate\Support\Str::plural($unit);
                    $allowance = trim("{$pe->quantity_limit} {$unitLabel} {$period}");
                } else {
                    $allowance = 'Included';
                }
                return [
                    'label' => $type->name,
                    'allowance' => $allowance,
                    'notes' => $pe->notes,
                ];
            })
            ->values()
            ->all();

        return new Content(
            view: 'emails.membership-activated',
            with: [
                'membership' => $m,
                'plan' => $m->plan,
                'patientName' => $m->patient ? trim(($m->patient->first_name ?? '') . ' ' . ($m->patient->last_name ?? '')) : null,
                'practice' => $m->practice ?? null,
                'entitlements' => $entitlements,
            ],
        );
    }
}
