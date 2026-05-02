<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreMembershipRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'patient_id' => 'required|uuid|exists:patients,id',
            'plan_id' => 'required|uuid|exists:membership_plans,id',
            // Default to monthly so the kebab "Enroll" dialog (which doesn't
            // ask for frequency) keeps working. Public/embedded enroll flows
            // should always send this explicitly.
            'billing_frequency' => 'sometimes|string|in:monthly,annual',
            // Comped path: practice_admin can grant a free membership
            // (employee plan, charity care, beta user). Requires a reason
            // for audit. When omitted, defaults to billed enrollment.
            'comp' => 'sometimes|boolean',
            'comp_reason' => 'required_if:comp,true|nullable|string|max:500',
            // Optional Stripe payment method id from the frontend Elements
            // confirm step. When present, attached as the subscription's
            // default_payment_method. When omitted on a stripe-billed
            // enrollment, the membership is created and Stripe sends a hosted
            // invoice email — practice can also send a payment link.
            'payment_method_id' => 'sometimes|string|max:200',
        ];
    }
}
