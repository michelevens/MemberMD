<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class DailyService
{
    private string $apiKey;
    private string $domain;

    public function __construct()
    {
        $this->apiKey = config('services.daily.api_key', '');
        $this->domain = config('services.daily.domain', 'membermd');
    }

    /**
     * Create a Daily.co video room for an appointment.
     */
    public function createRoom(string $appointmentId, array $options = []): array
    {
        // Fail fast when DAILY_API_KEY isn't configured on the host —
        // otherwise every room-create returns Daily's generic 401 body
        // and the user sees "Failed to create room" with no clue why.
        if (empty($this->apiKey)) {
            return [
                'error' => 'Telehealth video isn\'t configured yet — DAILY_API_KEY is not set on the backend. Set it in Railway env vars to enable video calls.',
                'reason' => 'missing_api_key',
            ];
        }

        $roomName = 'appt-' . substr(str_replace('-', '', $appointmentId), 0, 12);

        $response = Http::withHeaders(['Authorization' => 'Bearer ' . $this->apiKey])
            ->post('https://api.daily.co/v1/rooms', [
                'name' => $roomName,
                'privacy' => 'private',
                'properties' => [
                    'enable_knocking' => true,
                    'enable_screenshare' => true,
                    'enable_chat' => true,
                    'exp' => ($options['exp'] ?? now()->addHours(2)->timestamp),
                    'enable_recording' => $options['enable_recording'] ?? false,
                    'start_video_off' => false,
                    'start_audio_off' => false,
                ],
            ]);

        if (!$response->ok()) {
            // Daily.co returns errors like:
            // {"error":"already-exists","info":"a room named 'appt-xxx' already exists"}
            // Surface a parsed message when possible.
            $body = $response->json();
            $msg = is_array($body)
                ? ($body['info'] ?? $body['error'] ?? $response->body())
                : $response->body();
            return ['error' => "Daily.co: {$msg}"];
        }

        $data = $response->json();

        return [
            'name' => $data['name'],
            'url' => $data['url'],
            'id' => $data['id'],
        ];
    }

    /**
     * Delete a Daily.co room.
     */
    public function deleteRoom(string $roomName): bool
    {
        $response = Http::withHeaders(['Authorization' => 'Bearer ' . $this->apiKey])
            ->delete("https://api.daily.co/v1/rooms/{$roomName}");

        return $response->ok();
    }

    /**
     * Create a meeting token for a participant.
     */
    public function createMeetingToken(string $roomName, string $userName, bool $isOwner = false, ?int $exp = null): string
    {
        $response = Http::withHeaders(['Authorization' => 'Bearer ' . $this->apiKey])
            ->post('https://api.daily.co/v1/meeting-tokens', [
                'properties' => [
                    'room_name' => $roomName,
                    'user_name' => $userName,
                    'is_owner' => $isOwner,
                    'exp' => $exp ?? now()->addHours(2)->timestamp,
                    'enable_screenshare' => true,
                ],
            ]);

        return $response->json('token', '');
    }
}
