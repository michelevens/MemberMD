<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreAppointmentRequest extends FormRequest
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
            // Multi-location practices: pin the visit to a specific
            // facility. Nullable — single-facility practices and
            // telehealth visits can omit it.
            'facility_id' => 'nullable|uuid|exists:practice_facilities,id',
            'appointment_type_id' => 'nullable|uuid|exists:appointment_types,id',
            'scheduled_at' => 'required|date|after:now',
            'duration_minutes' => 'required|integer|min:5|max:480',
            'is_telehealth' => 'sometimes|boolean',
            'notes' => 'nullable|string|max:1000',
        ];
    }
}
