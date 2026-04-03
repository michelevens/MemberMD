<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EngagementCampaignNotification extends Notification
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
            ->subject($this->data['title'] ?? 'A message from your care team')
            ->line($this->data['body'] ?? 'Your care team has an update for you.')
            ->action('View Message', url('/'))
            ->line('Thank you for being a valued member.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => $this->data['title'] ?? 'Engagement Update',
            'body' => $this->data['body'] ?? '',
            'campaign_id' => $this->data['campaign_id'] ?? null,
            'type' => 'engagement_campaign',
        ];
    }
}
