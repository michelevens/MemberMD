<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProviderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => 'required|email|unique:users,email',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'password' => ['nullable', 'string', 'min:12', 'regex:/[A-Z]/', 'regex:/[a-z]/', 'regex:/[0-9]/', 'regex:/[^A-Za-z0-9]/'],
            'phone' => 'nullable|string|max:20',
            'title' => 'nullable|string|max:50',
            'credentials' => 'nullable|string|max:50',
            'bio' => 'nullable|string|max:2000',
            'specialties' => 'nullable|array',
            'languages' => 'nullable|array',
            'npi' => 'nullable|string|max:20',
            'license_number' => 'nullable|string|max:50',
            'license_state' => 'nullable|string|max:2',
            'panel_capacity' => 'nullable|integer|min:0',
            'panel_status' => 'nullable|string|in:open,limited,closed',
            'accepts_new_patients' => 'sometimes|boolean',
            'telehealth_enabled' => 'sometimes|boolean',
            'consultation_fee' => 'nullable|numeric|min:0',
        ];
    }
}
