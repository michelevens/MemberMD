<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateEncounterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
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
            'amendment_reason' => 'nullable|string|max:500',
        ];
    }
}
