<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Message;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MessageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Message::class);

        $user = $request->user();

        // Get latest message per thread where user is sender or recipient
        $threads = Message::where('tenant_id', $user->tenant_id)
            ->where(function ($q) use ($user) {
                $q->where('sender_id', $user->id)
                  ->orWhere('recipient_id', $user->id);
            })
            ->with(['sender', 'recipient'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->groupBy('thread_id')
            ->map(function ($messages) use ($user) {
                $latest = $messages->first();
                $unreadCount = $messages->where('recipient_id', $user->id)
                    ->whereNull('read_at')
                    ->count();
                $latest->unread_count = $unreadCount;
                $latest->message_count = $messages->count();
                return $latest;
            })
            ->values();

        return response()->json(['data' => $threads]);
    }

    public function thread(Request $request, string $threadId): JsonResponse
    {
        $user = $request->user();

        $messages = Message::where('tenant_id', $user->tenant_id)
            ->where('thread_id', $threadId)
            ->where(function ($q) use ($user) {
                $q->where('sender_id', $user->id)
                  ->orWhere('recipient_id', $user->id);
            })
            ->with(['sender', 'recipient'])
            ->orderBy('created_at', 'asc')
            ->get();

        if ($messages->isEmpty()) {
            abort(404, 'Thread not found.');
        }

        return response()->json(['data' => $messages]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Message::class);

        $user = $request->user();

        $validated = $request->validate([
            'recipient_id' => 'required|uuid|exists:users,id',
            'body' => 'required|string|max:5000',
            'thread_id' => 'nullable|uuid',
            'attachments' => 'nullable|array',
        ]);

        $message = Message::create([
            'tenant_id' => $user->tenant_id,
            'thread_id' => $validated['thread_id'] ?? (string) Str::uuid(),
            'sender_id' => $user->id,
            'recipient_id' => $validated['recipient_id'],
            'body' => $validated['body'],
            'attachments' => $validated['attachments'] ?? null,
            'is_system_message' => false,
        ]);

        return response()->json([
            'data' => $message->load(['sender', 'recipient'])
        ], 201);
    }

    public function markAsRead(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $message = Message::where('tenant_id', $user->tenant_id)
            ->where('recipient_id', $user->id)
            ->findOrFail($id);

        $message->update(['read_at' => now()]);

        return response()->json(['data' => $message->fresh()]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();

        $count = Message::where('tenant_id', $user->tenant_id)
            ->where('recipient_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json(['data' => ['unread_count' => $count]]);
    }
}
