<?php

namespace App\Services;

use App\Models\Message;
use App\Models\Patient;
use App\Models\SmsOptIn;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class TwilioSmsService
{
    protected string $sid;
    protected string $authToken;
    protected string $fromNumber;

    public function __construct()
    {
        $this->sid = config('services.twilio.sid', env('TWILIO_SID', ''));
        $this->authToken = config('services.twilio.auth_token', env('TWILIO_AUTH_TOKEN', ''));
        $this->fromNumber = config('services.twilio.from_number', env('TWILIO_FROM_NUMBER', ''));
    }

    /**
     * Send an SMS via Twilio REST API.
     *
     * @return string|null  Message SID on success, null on failure
     */
    public function sendSms(string $to, string $body, string $tenantId): ?string
    {
        // Check opt-in status
        $optIn = SmsOptIn::where('tenant_id', $tenantId)
            ->where('phone_number', $this->normalizePhone($to))
            ->where('opted_in', true)
            ->first();

        if (!$optIn) {
            Log::warning('SMS blocked: patient not opted in', ['to' => $to, 'tenant_id' => $tenantId]);
            return null;
        }

        if (empty($this->sid) || empty($this->authToken) || empty($this->fromNumber)) {
            Log::error('Twilio credentials not configured');
            return null;
        }

        try {
            $url = "https://api.twilio.com/2010-04-01/Accounts/{$this->sid}/Messages.json";

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_USERPWD => "{$this->sid}:{$this->authToken}",
                CURLOPT_POSTFIELDS => http_build_query([
                    'To' => $to,
                    'From' => $this->fromNumber,
                    'Body' => $body,
                    'StatusCallback' => url('/api/webhooks/sms/status'),
                ]),
            ]);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $data = json_decode($response, true);
                return $data['sid'] ?? null;
            }

            Log::error('Twilio send failed', [
                'http_code' => $httpCode,
                'response' => $response,
            ]);
            return null;
        } catch (\Throwable $e) {
            Log::error('Twilio SMS exception: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Handle an inbound SMS from Twilio webhook.
     * Matches phone number to a patient and creates a Message record.
     */
    public function handleInbound(string $from, string $body, string $to): ?Message
    {
        $normalizedFrom = $this->normalizePhone($from);

        // Find the opt-in record to determine patient and tenant
        $optIn = SmsOptIn::where('phone_number', $normalizedFrom)
            ->where('opted_in', true)
            ->first();

        if (!$optIn) {
            Log::info('Inbound SMS from unknown/opted-out number', ['from' => $from]);
            return null;
        }

        $patient = Patient::find($optIn->patient_id);
        if (!$patient || !$patient->user_id) {
            Log::warning('Inbound SMS: patient not found or has no user account', [
                'patient_id' => $optIn->patient_id,
            ]);
            return null;
        }

        // Find a practice admin or provider to be the "recipient" of this inbound message
        // Use the most recent message thread with this patient, or default to a practice admin
        $lastMessage = Message::where('tenant_id', $optIn->tenant_id)
            ->where(function ($q) use ($patient) {
                $q->where('sender_id', $patient->user_id)
                  ->orWhere('recipient_id', $patient->user_id);
            })
            ->orderBy('created_at', 'desc')
            ->first();

        $recipientId = null;
        $threadId = null;

        if ($lastMessage) {
            $recipientId = $lastMessage->sender_id === $patient->user_id
                ? $lastMessage->recipient_id
                : $lastMessage->sender_id;
            $threadId = $lastMessage->thread_id;
        } else {
            // Default to any practice_admin for this tenant
            $admin = User::where('tenant_id', $optIn->tenant_id)
                ->where('role', 'practice_admin')
                ->where('status', 'active')
                ->first();

            $recipientId = $admin?->id;
            $threadId = (string) Str::uuid();
        }

        if (!$recipientId) {
            Log::warning('Inbound SMS: no recipient found for tenant', [
                'tenant_id' => $optIn->tenant_id,
            ]);
            return null;
        }

        return Message::create([
            'tenant_id' => $optIn->tenant_id,
            'thread_id' => $threadId,
            'sender_id' => $patient->user_id,
            'recipient_id' => $recipientId,
            'body' => $body,
            'is_system_message' => false,
            'channel' => 'sms',
            'external_id' => null, // Inbound doesn't have our SID
        ]);
    }

    /**
     * Normalize a phone number to E.164-ish format for consistent matching.
     */
    protected function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);

        // If 10 digits, prepend US country code
        if (strlen($digits) === 10) {
            $digits = '1' . $digits;
        }

        return '+' . $digits;
    }
}
