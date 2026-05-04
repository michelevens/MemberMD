<?php

namespace App\Notifications;

use App\Models\SignatureRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app notification fired to a patient when their practice creates
 * a SignatureRequest for them. The email link is the primary channel,
 * but this puts a bell-badge entry in the patient portal too so the
 * action is visible the next time they log in.
 */
class SignatureRequestReceived extends Notification
{
    use Queueable;

    public function __construct(
        public readonly SignatureRequest $request,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $template = $this->request->template;

        return [
            'category' => 'signature',
            'title' => 'New document to sign',
            'body' => 'Your practice sent ' . ($template?->name ?? 'a document') . ' for you to review and sign.',
            'signature_request_id' => $this->request->id,
            'template_name' => $template?->name,
        ];
    }
}
