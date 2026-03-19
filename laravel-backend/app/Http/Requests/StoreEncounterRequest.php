<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreEncounterRequest extends FormRequest
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
            'appointment_id' => 'nullable|uuid|exists:appointments,id',
            'encounter_date' => 'required|date',
            'encounter_type' => 'required|string|in:office_visit,telehealth,phone,urgent,follow_up,annual_wellness,procedure',
            'chief_complaint' => 'nullable|string|max:500',
            'subjective' => 'nullable|string',
            'objective' => 'nullable|string',
            'assessment' => 'nullable|string',
            'plan' => 'nullable|string',
            'diagnoses' => 'nullable|array',
            'vitals' => 'nullable|array',
            'prescriptions_written' => 'nullable|array',
            'labs_ordered' => 'nullable|array',
            'follow_up_instructions' => 'nullable|string|max:1000',
            'follow_up_weeks' => 'nullable|integer|min:1|max:52',
            'screening_scores' => 'nullable|array',
        ];
    }
}
