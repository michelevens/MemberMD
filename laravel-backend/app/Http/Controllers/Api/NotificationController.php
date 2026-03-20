<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $notifications = $user->notifications()
            ->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $notifications]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => ['unread_count' => $user->unreadNotifications()->count()]
        ]);
    }

    public function markAsRead(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $notification = $user->notifications()->findOrFail($id);
        $notification->markAsRead();

        return response()->json(['data' => $notification->fresh()]);
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->unreadNotifications->markAsRead();

        return response()->json(['data' => ['message' => 'All notifications marked as read.']]);
    }

    public function getPreferences(Request $request): JsonResponse
    {
        $user = $request->user();

        $preference = NotificationPreference::firstOrNew(
            ['user_id' => $user->id],
            [
                'appointment_reminders' => true,
                'billing_alerts' => true,
                'message_notifications' => true,
                'marketing_emails' => false,
                'sms_enabled' => true,
                'push_enabled' => true,
                'categories' => NotificationPreference::DEFAULT_CATEGORIES,
                'digest_frequency' => 'immediate',
            ]
        );

        return response()->json([
            'data' => [
                'appointment_reminders' => $preference->appointment_reminders,
                'billing_alerts' => $preference->billing_alerts,
                'message_notifications' => $preference->message_notifications,
                'marketing_emails' => $preference->marketing_emails,
                'sms_enabled' => $preference->sms_enabled,
                'push_enabled' => $preference->push_enabled,
                'categories' => $preference->getCategoriesWithDefaults(),
                'quiet_hours_start' => $preference->quiet_hours_start,
                'quiet_hours_end' => $preference->quiet_hours_end,
                'digest_frequency' => $preference->digest_frequency ?? 'immediate',
            ],
        ]);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $user = $request->user();

        $validCategories = array_keys(NotificationPreference::DEFAULT_CATEGORIES);
        $validChannels = ['in_app', 'email', 'sms'];

        $validated = $request->validate([
            'appointment_reminders' => 'sometimes|boolean',
            'billing_alerts' => 'sometimes|boolean',
            'message_notifications' => 'sometimes|boolean',
            'marketing_emails' => 'sometimes|boolean',
            'sms_enabled' => 'sometimes|boolean',
            'push_enabled' => 'sometimes|boolean',
            'categories' => 'sometimes|array',
            'categories.*' => 'array',
            'categories.*.*' => 'boolean',
            'quiet_hours_start' => 'sometimes|nullable|date_format:H:i',
            'quiet_hours_end' => 'sometimes|nullable|date_format:H:i',
            'digest_frequency' => ['sometimes', Rule::in(NotificationPreference::DIGEST_FREQUENCIES)],
        ]);

        // Validate category keys
        if (isset($validated['categories'])) {
            foreach (array_keys($validated['categories']) as $cat) {
                if (!in_array($cat, $validCategories)) {
                    return response()->json([
                        'message' => "Invalid category: {$cat}",
                        'errors' => ['categories' => ["Unknown category: {$cat}"]],
                    ], 422);
                }
            }

            foreach ($validated['categories'] as $cat => $channels) {
                foreach (array_keys($channels) as $ch) {
                    if (!in_array($ch, $validChannels)) {
                        return response()->json([
                            'message' => "Invalid channel: {$ch}",
                            'errors' => ['categories' => ["Unknown channel: {$ch} in category: {$cat}"]],
                        ], 422);
                    }
                }
            }
        }

        $preference = NotificationPreference::updateOrCreate(
            ['user_id' => $user->id],
            $validated
        );

        return response()->json([
            'data' => [
                'appointment_reminders' => $preference->appointment_reminders,
                'billing_alerts' => $preference->billing_alerts,
                'message_notifications' => $preference->message_notifications,
                'marketing_emails' => $preference->marketing_emails,
                'sms_enabled' => $preference->sms_enabled,
                'push_enabled' => $preference->push_enabled,
                'categories' => $preference->getCategoriesWithDefaults(),
                'quiet_hours_start' => $preference->quiet_hours_start,
                'quiet_hours_end' => $preference->quiet_hours_end,
                'digest_frequency' => $preference->digest_frequency,
            ],
        ]);
    }
}
