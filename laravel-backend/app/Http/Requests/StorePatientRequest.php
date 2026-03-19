<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePatientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:20',
            'date_of_birth' => 'nullable|date',
            'gender' => 'nullable|string|max:20',
            'pronouns' => 'nullable|string|max:50',
            'preferred_name' => 'nullable|string|max:100',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'preferred_language' => 'nullable|string|max:50',
            'marital_status' => 'nullable|string|max:30',
            'employment_status' => 'nullable|string|max:30',
            'emergency_contacts' => 'nullable|array',
            'primary_diagnoses' => 'nullable|array',
            'allergies' => 'nullable|array',
            'medications' => 'nullable|array',
            'primary_care_physician' => 'nullable|string|max:255',
            'pcp_phone' => 'nullable|string|max:20',
            'referring_provider' => 'nullable|string|max:255',
            'insurance_primary' => 'nullable|array',
            'insurance_secondary' => 'nullable|array',
            'pharmacy_name' => 'nullable|string|max:255',
            'pharmacy_address' => 'nullable|string|max:255',
            'pharmacy_phone' => 'nullable|string|max:20',
            'referral_source' => 'nullable|string|max:100',
        ];
    }
}
