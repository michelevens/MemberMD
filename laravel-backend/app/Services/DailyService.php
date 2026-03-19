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
            return ['error' => $response->body()];
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
