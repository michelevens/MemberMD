<?php

namespace App\Services;

use App\Models\NotificationPreference;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class NotificationDispatcher
{
    /**
     * Determine whether a notification should be sent to a user
     * for a given category and channel, respecting preferences and quiet hours.
     */
    public function shouldSend(string $userId, string $category, string $channel): bool
    {
        $preference = NotificationPreference::where('user_id', $userId)->first();

        // If no preferences exist, use defaults (allow all except sms)
        if (!$preference) {
            $defaults = NotificationPreference::DEFAULT_CATEGORIES;

            if (!isset($defaults[$category])) {
                return true; // Unknown category: allow by default
            }

            return $defaults[$category][$channel] ?? false;
        }

        // Check category-level channel preference
        $categories = $preference->getCategoriesWithDefaults();

        if (isset($categories[$category])) {
            $channelEnabled = $categories[$category][$channel] ?? false;

            if (!$channelEnabled) {
                return false;
            }
        }

        // Check quiet hours (only applies to sms and push-style channels)
        if (in_array($channel, ['sms', 'push'])) {
            if ($this->isInQuietHours($preference)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Send a notification to a user via Laravel's notification system.
     */
    public function sendNotification(User $user, string $notificationClass, array $data = []): void
    {
        try {
            if (!$this->shouldSend($user->id, $data['category'] ?? 'general', 'in_app')) {
                return;
            }

            if (class_exists($notificationClass)) {
                $user->notify(new $notificationClass($data));
            } else {
                Log::info("Notification queued: {$notificationClass} for user {$user->id}", $data);
            }
        } catch (\Throwable $e) {
            Log::warning("Failed to send notification to user {$user->id}: " . $e->getMessage());
        }
    }

    /**
     * Check if the current time falls within the user's quiet hours.
     */
    protected function isInQuietHours(NotificationPreference $preference): bool
    {
        if (!$preference->quiet_hours_start || !$preference->quiet_hours_end) {
            return false;
        }

        $now = Carbon::now()->format('H:i:s');
        $start = $preference->quiet_hours_start;
        $end = $preference->quiet_hours_end;

        // Handle overnight quiet hours (e.g. 22:00 -> 07:00)
        if ($start > $end) {
            return $now >= $start || $now <= $end;
        }

        return $now >= $start && $now <= $end;
    }
}
