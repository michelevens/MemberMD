<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Provider;
use App\Services\CalendarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CalendarController extends Controller
{
    /**
     * Public iCal feed for a provider (no auth required).
     */
    public function icalFeed(string $token)
    {
        $provider = Provider::withoutGlobalScopes()
            ->where('ical_feed_token', $token)
            ->firstOrFail();

        $service = new CalendarService();
        $ical = $service->generateICalFeed(
            $provider,
            request()->query('start'),
            request()->query('end')
        );

        return response($ical, 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Content-Disposition' => 'inline; filename="membermd-schedule.ics"',
        ]);
    }

    /**
     * Generate a random iCal feed token for the current provider.
     */
    public function generateToken(Request $request): JsonResponse
    {
        $user = $request->user();

        $provider = Provider::where('user_id', $user->id)->first();
        if (!$provider) {
            return response()->json(['message' => 'You are not a provider.'], 403);
        }

        $token = Str::random(48);
        $provider->update(['ical_feed_token' => $token]);

        $feedUrl = url("/api/calendar/ical/{$token}");

        return response()->json([
            'data' => [
                'token' => $token,
                'feed_url' => $feedUrl,
            ],
        ]);
    }

    /**
     * Get calendar add-links for an appointment.
     */
    public function calendarLinks(Request $request, string $appointmentId): JsonResponse
    {
        $user = $request->user();

        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($appointmentId);

        $service = new CalendarService();
        $links = $service->generateCalendarLinks($appointment);

        return response()->json(['data' => $links]);
    }

    /**
     * Google Calendar OAuth redirect URL (placeholder for future implementation).
     */
    public function googleRedirect(Request $request): JsonResponse
    {
        // Placeholder — Google OAuth integration to be implemented
        return response()->json([
            'data' => [
                'redirect_url' => null,
                'message' => 'Google Calendar OAuth integration is not yet configured.',
            ],
        ]);
    }
}
