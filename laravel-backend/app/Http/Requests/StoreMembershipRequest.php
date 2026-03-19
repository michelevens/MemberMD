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
            'billing_frequency' => 'required|string|in:monthly,annual',
        ];
    }
}
