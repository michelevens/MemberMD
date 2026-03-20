<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationPreference extends Model
{
    use HasFactory, HasUuids;

    public const DEFAULT_CATEGORIES = [
        'appointments' => ['in_app' => true, 'email' => true, 'sms' => false],
        'messages' => ['in_app' => true, 'email' => true, 'sms' => false],
        'billing' => ['in_app' => true, 'email' => true, 'sms' => false],
        'lab_results' => ['in_app' => true, 'email' => true, 'sms' => false],
        'prescriptions' => ['in_app' => true, 'email' => true, 'sms' => false],
        'system' => ['in_app' => true, 'email' => false, 'sms' => false],
    ];

    public const DIGEST_FREQUENCIES = ['immediate', 'daily', 'weekly'];

    protected $fillable = [
        'user_id',
        'appointment_reminders', 'billing_alerts',
        'message_notifications', 'marketing_emails',
        'sms_enabled', 'push_enabled',
        'categories', 'quiet_hours_start', 'quiet_hours_end',
        'digest_frequency',
    ];

    protected $casts = [
        'appointment_reminders' => 'boolean',
        'billing_alerts' => 'boolean',
        'message_notifications' => 'boolean',
        'marketing_emails' => 'boolean',
        'sms_enabled' => 'boolean',
        'push_enabled' => 'boolean',
        'categories' => 'array',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }

    /**
     * Get categories with defaults merged in for any missing keys.
     */
    public function getCategoriesWithDefaults(): array
    {
        $categories = $this->categories ?? [];

        return array_merge(self::DEFAULT_CATEGORIES, $categories);
    }
}
