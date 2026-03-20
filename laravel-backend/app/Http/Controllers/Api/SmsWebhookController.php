<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Message;
use App\Services\TwilioSmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class SmsWebhookController extends Controller
{
    /**
     * POST /api/webhooks/sms/inbound
     * Twilio inbound SMS webhook — matches phone to patient, creates message in thread.
     */
    public function inbound(Request $request): JsonResponse
    {
        $from = $request->input('From', '');
        $body = $request->input('Body', '');
        $to = $request->input('To', '');

        if (empty($from) || empty($body)) {
            return response()->json(['error' => 'Missing required fields'], 400);
        }

        Log::info('Inbound SMS received', ['from' => $from, 'to' => $to]);

        $service = new TwilioSmsService();
        $message = $service->handleInbound($from, $body, $to);

        if (!$message) {
            // Return 200 to Twilio so it doesn't retry, but log the issue
            return response()->json(['data' => ['status' => 'ignored', 'reason' => 'No matching patient found']]);
        }

        return response()->json(['data' => ['status' => 'received', 'message_id' => $message->id]]);
    }

    /**
     * POST /api/webhooks/sms/status
     * Twilio delivery status callback — updates message delivery_status.
     */
    public function status(Request $request): JsonResponse
    {
        $messageSid = $request->input('MessageSid', '');
        $messageStatus = $request->input('MessageStatus', '');

        if (empty($messageSid) || empty($messageStatus)) {
            return response()->json(['error' => 'Missing required fields'], 400);
        }

        Log::info('SMS status update', ['sid' => $messageSid, 'status' => $messageStatus]);

        $message = Message::where('external_id', $messageSid)->first();

        if ($message) {
            $message->update(['delivery_status' => $messageStatus]);
        }

        return response()->json(['data' => ['status' => 'processed']]);
    }
}
