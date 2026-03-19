<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'patient_id' => 'required|uuid|exists:patients,id',
            'membership_id' => 'nullable|uuid|exists:patient_memberships,id',
            'amount' => 'required|numeric|min:0.01',
            'tax' => 'nullable|numeric|min:0',
            'description' => 'nullable|string|max:500',
            'line_items' => 'nullable|array',
            'due_date' => 'nullable|date',
        ];
    }
}
