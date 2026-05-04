<?php

namespace App\Services;

use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Log;

/**
 * LiveKit telehealth video service.
 *
 * Why LiveKit (over Daily.co): we own the data path, in-call SDK is
 * richer (chat, screen-share, recording all built into livekit-client),
 * pricing is similar (~$0.003/min on cloud), and the same SFU is open-
 * source if we ever self-host.
 *
 * Architecture choice — auto-create rooms on first join:
 *   LiveKit will lazy-create a room the first time a participant joins
 *   with a valid token referencing that room name. We don't hit
 *   LiveKit's RoomService REST API ahead of time. Less to break, no
 *   round-trip on every booking. The downside is we can't reject
 *   "this room name is already taken" before booking — but our room
 *   names are appointment-id-derived and unique, so collisions are
 *   impossible by construction.
 *
 * Token strategy:
 *   - HS256 JWT, signed with the api_secret
 *   - 4-hour TTL — long enough for a session that runs over, short
 *     enough that a stolen token isn't useful for long
 *   - Patient tokens: canPublish + canSubscribe + canPublishData (chat)
 *   - Provider tokens: same plus roomAdmin (kick / mute participants)
 *
 * The api_secret is server-side only. Frontend joins with the minted
 * JWT; it never sees the secret.
 */
class LiveKitService
{
    private string $url;
    private string $apiKey;
    private string $apiSecret;

    public function __construct()
    {
        $this->url = (string) config('services.livekit.url', '');
        $this->apiKey = (string) config('services.livekit.api_key', '');
        $this->apiSecret = (string) config('services.livekit.api_secret', '');
    }

    /**
     * Whether the service is configured. Used by the controller to
     * fail fast with a clear error when env vars aren't set.
     */
    public function isConfigured(): bool
    {
        return $this->url !== '' && $this->apiKey !== '' && $this->apiSecret !== '';
    }

    /**
     * Synthesize the room descriptor for an appointment. Doesn't hit
     * LiveKit's API — the room is created lazily when the first
     * participant joins with a valid token.
     *
     * Returns an array shaped to match what DailyService::createRoom
     * returned, so the controller doesn't need to care which backend
     * is in play:
     *   [name => "...", url => "...", id => "...", error? => "..."]
     */
    public function createRoom(string $appointmentId, array $options = []): array
    {
        unset($options); // currently unused — recording / metadata is a follow-up

        if (!$this->isConfigured()) {
            return [
                'error' => 'Telehealth video isn\'t configured yet — LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not all set on the backend.',
                'reason' => 'missing_credentials',
            ];
        }

        $roomName = $this->roomNameForAppointment($appointmentId);

        return [
            'name' => $roomName,
            // We return the wss:// URL as room_url for symmetry with the
            // DailyService shape. The frontend uses LIVEKIT_URL + the
            // minted token to actually connect — it doesn't navigate to
            // the URL like a Daily.co iframe.
            'url' => $this->url,
            'id' => $roomName, // LiveKit doesn't issue a separate id — name IS the id
        ];
    }

    /**
     * Mint a JWT access token for a participant joining a specific
     * room. Returns the signed token string ready to hand to the
     * livekit-client SDK.
     *
     * @param string $roomName  The room to join (synthesized from
     *                          appointment id; see roomNameForAppointment)
     * @param string $identity  Stable participant id — we use the
     *                          authenticated user's id so reconnects
     *                          replace the stale participant entry
     * @param string $name      Display name shown to other participants
     * @param bool   $isOwner   Provider/admin? Grants roomAdmin.
     * @param int    $ttlSeconds Token lifetime; default 4 hours.
     */
    public function mintAccessToken(
        string $roomName,
        string $identity,
        string $name,
        bool $isOwner = false,
        int $ttlSeconds = 14400,
    ): string {
        if (!$this->isConfigured()) {
            // Caller should have checked isConfigured() first. Returning
            // empty rather than throwing because the controller already
            // has a graceful failure path for "no token".
            Log::warning('LiveKitService::mintAccessToken called without credentials configured');
            return '';
        }

        $now = time();
        $payload = [
            // Standard JWT claims
            'iss' => $this->apiKey,
            'sub' => $identity,
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + $ttlSeconds,
            // LiveKit-specific claims
            'name' => $name,
            'video' => [
                'room' => $roomName,
                'roomJoin' => true,
                'canPublish' => true,
                'canSubscribe' => true,
                'canPublishData' => true, // chat over LiveKit DataPackets
                'roomAdmin' => $isOwner,
            ],
            'metadata' => json_encode([
                'role' => $isOwner ? 'provider' : 'participant',
            ]),
        ];

        return JWT::encode($payload, $this->apiSecret, 'HS256');
    }

    /**
     * Stable room name from an appointment id. Same id always yields
     * the same name, so reconnects find the same room. LiveKit room
     * names must be alphanumeric-ish — strip dashes from the UUID.
     */
    public function roomNameForAppointment(string $appointmentId): string
    {
        return 'appt-' . substr(str_replace('-', '', $appointmentId), 0, 24);
    }
}
