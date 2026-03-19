<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAppointmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'scheduled_at' => 'sometimes|date',
            'duration_minutes' => 'sometimes|integer|min:5|max:480',
            'status' => 'sometimes|string|in:scheduled,confirmed,checked_in,in_progress,completed,no_show,cancelled',
            'provider_id' => 'sometimes|uuid|exists:providers,id',
            'appointment_type_id' => 'sometimes|uuid|exists:appointment_types,id',
            'is_telehealth' => 'sometimes|boolean',
            'video_room_url' => 'nullable|string|max:500',
            'notes' => 'nullable|string|max:1000',
            'cancel_reason' => 'nullable|string|max:500',
        ];
    }
}
