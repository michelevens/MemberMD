<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePrescriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'patient_id' => 'required|uuid|exists:patients,id',
            'provider_id' => 'required|uuid|exists:providers,id',
            'encounter_id' => 'nullable|uuid|exists:encounters,id',
            'medication_name' => 'required|string|max:255',
            'dosage' => 'required|string|max:100',
            'frequency' => 'required|string|max:100',
            'route' => 'nullable|string|max:50',
            'quantity' => 'nullable|integer|min:1',
            'refills' => 'nullable|integer|min:0',
            'is_controlled' => 'sometimes|boolean',
            'schedule' => 'nullable|string|max:20',
            'pharmacy_name' => 'nullable|string|max:255',
            'pharmacy_phone' => 'nullable|string|max:20',
            'notes' => 'nullable|string|max:1000',
        ];
    }
}
