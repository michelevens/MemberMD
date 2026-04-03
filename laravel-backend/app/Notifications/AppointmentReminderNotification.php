<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class AppointmentReminderNotification extends Notification
{
    use Queueable;

    public function __construct(
        private array $data = []
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject($this->data['title'] ?? 'Appointment Reminder')
            ->line($this->data['body'] ?? 'You have an upcoming appointment.')
            ->action('View Appointment', url('/'))
            ->line('Please reply to confirm or contact us to reschedule.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => $this->data['title'] ?? 'Appointment Reminder',
            'body' => $this->data['body'] ?? '',
            'appointment_id' => $this->data['appointment_id'] ?? null,
            'scheduled_at' => $this->data['scheduled_at'] ?? null,
            'type' => 'appointment_reminder',
        ];
    }
}
