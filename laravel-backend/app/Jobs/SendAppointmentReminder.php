<?php

namespace App\Jobs;

use App\Models\AppointmentReminder;
use App\Services\NotificationDispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class SendAppointmentReminder implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private AppointmentReminder $reminder
    ) {}

    public function handle(NotificationDispatcher $dispatcher): void
    {
        if (!$this->reminder->isPending()) {
            return;
        }

        $appointment = $this->reminder->appointment;
        $patient = $this->reminder->patient;
        $channels = $this->reminder->channels ?? ['email', 'in_app'];

        try {
            // Send in-app notification
            if (in_array('in_app', $channels) && $patient->user_id) {
                $dispatcher->sendNotification(
                    $patient->user,
                    'App\\Notifications\\AppointmentReminderNotification',
                    [
                        'title' => 'Appointment Reminder',
                        'body' => "Your appointment with {$appointment->provider->user->full_name} is scheduled for " .
                                  $appointment->scheduled_at->format('M d, Y at g:i A'),
                        'appointment_id' => $appointment->id,
                        'scheduled_at' => $appointment->scheduled_at->toIso8601String(),
                    ]
                );
            }

            // Send email
            if (in_array('email', $channels) && $patient->email) {
                Mail::raw(
                    "Your appointment with {$appointment->provider->user->full_name} is scheduled for " .
                    $appointment->scheduled_at->format('M d, Y at g:i A') . ". " .
                    "Please reply to confirm or contact us if you need to reschedule.",
                    function ($message) use ($patient, $appointment) {
                        $message->to($patient->email)
                            ->subject("Appointment Reminder - {$appointment->scheduled_at->format('M d, Y')}");
                    }
                );
            }

            // Mark as sent
            $this->reminder->update([
                'status' => 'sent',
                'sent_at' => now(),
            ]);

            Log::info("Appointment reminder sent for patient {$patient->id}, appointment {$appointment->id}");
        } catch (\Throwable $e) {
            $this->reminder->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);

            Log::error("Failed to send appointment reminder: " . $e->getMessage());
            throw $e;
        }
    }
}
