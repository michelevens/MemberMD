<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationPreference extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'appointment_reminders', 'billing_alerts',
        'message_notifications', 'marketing_emails',
        'sms_enabled', 'push_enabled',
    ];

    protected $casts = [
        'appointment_reminders' => 'boolean',
        'billing_alerts' => 'boolean',
        'message_notifications' => 'boolean',
        'marketing_emails' => 'boolean',
        'sms_enabled' => 'boolean',
        'push_enabled' => 'boolean',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
