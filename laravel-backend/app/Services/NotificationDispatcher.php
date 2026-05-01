<?php

namespace App\Services;

use App\Jobs\SendWebPushNotification;
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

        // Master switches — if the user has globally disabled push or sms,
        // the per-category matrix never overrides that.
        if ($channel === 'push' && $preference->push_enabled === false) {
            return false;
        }
        if ($channel === 'sms' && $preference->sms_enabled === false) {
            return false;
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
     *
     * Also fans the same payload out as a Web Push notification when the
     * user has push subscriptions and their preferences allow it for the
     * given category. The push is dispatched as a queued job so the
     * caller's request thread isn't blocked on transport calls.
     */
    public function sendNotification(User $user, string $notificationClass, array $data = []): void
    {
        $category = $data['category'] ?? 'general';

        try {
            if ($this->shouldSend($user->id, $category, 'in_app')) {
                if (class_exists($notificationClass)) {
                    $user->notify(new $notificationClass($data));
                } else {
                    Log::info("Notification queued: {$notificationClass} for user {$user->id}", $data);
                }
            }
        } catch (\Throwable $e) {
            Log::warning("Failed to send notification to user {$user->id}: " . $e->getMessage());
        }

        try {
            if ($this->shouldSend($user->id, $category, 'push')) {
                $payload = [
                    'title' => (string) ($data['title'] ?? 'MemberMD'),
                    'body' => (string) ($data['body'] ?? ''),
                    'url' => isset($data['url']) ? (string) $data['url'] : '/',
                    'tag' => isset($data['tag']) ? (string) $data['tag'] : ($category ?: null),
                ];
                SendWebPushNotification::dispatch($user->id, $payload);
            }
        } catch (\Throwable $e) {
            Log::warning("Failed to queue push for user {$user->id}: " . $e->getMessage());
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
