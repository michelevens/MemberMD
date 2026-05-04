<?php

namespace App\Notifications;

use App\Models\Appointment;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app notification fired to a patient when staff approves, denies,
 * or cancels their appointment. The email side is dispatched from the
 * controller separately; this is the bell-badge entry that surfaces
 * next time the patient opens the portal.
 *
 * `transition` is one of: "approved" | "denied" | "cancelled". Used to
 * pick the title/body so each entry reads naturally.
 */
class AppointmentStatusChanged extends Notification
{
    use Queueable;

    public function __construct(
        public readonly Appointment $appointment,
        public readonly string $transition,
        public readonly ?string $reason = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $when = Carbon::parse($this->appointment->scheduled_at)->format('M j, Y g:i A');

        $title = match ($this->transition) {
            'approved'  => 'Appointment confirmed',
            'denied'    => 'Appointment request not approved',
            'cancelled' => 'Appointment cancelled',
            default     => 'Appointment update',
        };

        $body = match ($this->transition) {
            'approved'  => "Your appointment on {$when} is confirmed.",
            'denied'    => "Your request for {$when} wasn't approved" . ($this->reason ? ": {$this->reason}" : '.'),
            'cancelled' => "Your appointment on {$when} was cancelled" . ($this->reason ? ": {$this->reason}" : '.'),
            default     => "Status of your appointment on {$when} has changed.",
        };

        return [
            'category' => 'appointment',
            'title' => $title,
            'body' => $body,
            'appointment_id' => $this->appointment->id,
            'transition' => $this->transition,
            'scheduled_at' => $this->appointment->scheduled_at,
        ];
    }
}
