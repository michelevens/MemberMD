<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}
