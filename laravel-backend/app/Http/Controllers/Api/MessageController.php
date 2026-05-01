<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Message;
use App\Services\TwilioSmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MessageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Message::class);

        $user = $request->user();

        // patient_id mode — used by the practice-side patient detail
        // drawer to render that patient's full message history. Allowed
        // for staff/provider/admin only; patients can never look up
        // another user's threads via this query parameter.
        if ($request->filled('patient_id') && !$user->isPatient()) {
            $patient = \App\Models\Patient::where('tenant_id', $user->tenant_id)
                ->find($request->patient_id);
            if (!$patient || !$patient->user_id) {
                return response()->json(['data' => []]);
            }
            $messages = Message::where('tenant_id', $user->tenant_id)
                ->where(function ($q) use ($patient) {
                    $q->where('sender_id', $patient->user_id)
                      ->orWhere('recipient_id', $patient->user_id);
                })
                ->with(['sender', 'recipient'])
                ->orderBy('created_at', 'asc')
                ->get();
            return response()->json(['data' => $messages]);
        }

        // Default mode — latest message per thread where current user
        // is sender or recipient.
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

        // Recipient MUST belong to the same tenant — without this scope check,
        // a practice_admin in tenant A could send messages to any user in
        // tenant B, creating a cross-tenant PHI exfiltration channel
        // (audit finding B3, 2026-04-28).
        $validated = $request->validate([
            'recipient_id' => [
                'required', 'uuid',
                \Illuminate\Validation\Rule::exists('users', 'id')
                    ->where('tenant_id', $user->tenant_id),
            ],
            'body' => 'required|string|max:5000',
            'thread_id' => 'nullable|uuid',
            'attachments' => 'nullable|array',
            'channel' => 'nullable|string|in:portal,sms,email',
        ]);

        $channel = $validated['channel'] ?? 'portal';

        $messageData = [
            'tenant_id' => $user->tenant_id,
            'thread_id' => $validated['thread_id'] ?? (string) Str::uuid(),
            'sender_id' => $user->id,
            'recipient_id' => $validated['recipient_id'],
            'body' => $validated['body'],
            'attachments' => $validated['attachments'] ?? null,
            'is_system_message' => false,
            'channel' => $channel,
        ];

        // If SMS channel, send via Twilio
        if ($channel === 'sms') {
            $recipient = \App\Models\User::find($validated['recipient_id']);
            $patient = $recipient?->patient;
            $phone = $patient?->phone ?? $recipient?->phone;

            if (!$phone) {
                return response()->json([
                    'message' => 'Recipient has no phone number on file.',
                    'errors' => ['channel' => ['No phone number available for SMS.']],
                ], 422);
            }

            $twilioService = new TwilioSmsService();
            $sid = $twilioService->sendSms($phone, $validated['body'], $user->tenant_id);

            $messageData['external_id'] = $sid;
            $messageData['delivery_status'] = $sid ? 'sent' : 'failed';
        }

        $message = Message::create($messageData);

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
