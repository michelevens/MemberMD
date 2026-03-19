<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Provider;
use Carbon\Carbon;

class CalendarService
{
    /**
     * Generate calendar add-links for an appointment (Google, Yahoo, Outlook, iCal).
     */
    public function generateCalendarLinks(Appointment $appointment): array
    {
        $appointment->loadMissing(['patient', 'provider.user', 'appointmentType']);

        $title = urlencode(
            ($appointment->appointmentType->name ?? 'Appointment') .
            ' with ' .
            ($appointment->provider->user->first_name ?? 'Provider')
        );

        $start = Carbon::parse($appointment->scheduled_at);
        $end = $start->copy()->addMinutes($appointment->duration_minutes);

        $description = urlencode(
            'MemberMD Appointment' .
            ($appointment->is_telehealth ? ' (Telehealth - join from your dashboard)' : '')
        );
        $location = urlencode($appointment->is_telehealth ? 'Telehealth Video Visit' : 'In-Office');

        // Google Calendar
        $googleStart = $start->utc()->format('Ymd\THis\Z');
        $googleEnd = $end->utc()->format('Ymd\THis\Z');
        $google = "https://calendar.google.com/calendar/render?action=TEMPLATE&text={$title}&dates={$googleStart}/{$googleEnd}&details={$description}&location={$location}";

        // Yahoo Calendar
        $yahooStart = $start->utc()->format('Ymd\THis\Z');
        $yahooDur = sprintf('%02d%02d', intdiv($appointment->duration_minutes, 60), $appointment->duration_minutes % 60);
        $yahoo = "https://calendar.yahoo.com/?v=60&title={$title}&st={$yahooStart}&dur={$yahooDur}&desc={$description}&in_loc={$location}";

        // Outlook Web
        $outlookStart = $start->utc()->toIso8601String();
        $outlookEnd = $end->utc()->toIso8601String();
        $outlook = "https://outlook.live.com/calendar/0/action/compose?subject={$title}&startdt={$outlookStart}&enddt={$outlookEnd}&body={$description}&location={$location}";

        // iCal file content
        $uid = $appointment->id . '@membermd.io';
        $ical = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MemberMD//EN\r\nBEGIN:VEVENT\r\nUID:{$uid}\r\nDTSTAMP:" .
            now()->utc()->format('Ymd\THis\Z') .
            "\r\nDTSTART:{$googleStart}\r\nDTEND:{$googleEnd}\r\nSUMMARY:" .
            ($appointment->appointmentType->name ?? 'Appointment') .
            "\r\nDESCRIPTION:MemberMD Appointment\r\nLOCATION:" .
            ($appointment->is_telehealth ? 'Telehealth' : 'In-Office') .
            "\r\nEND:VEVENT\r\nEND:VCALENDAR";

        return compact('google', 'yahoo', 'outlook', 'ical');
    }

    /**
     * Generate an iCal feed for a provider's schedule.
     */
    public function generateICalFeed(Provider $provider, ?string $startDate = null, ?string $endDate = null): string
    {
        $start = $startDate ? Carbon::parse($startDate) : now()->subMonth();
        $end = $endDate ? Carbon::parse($endDate) : now()->addMonths(3);

        $appointments = Appointment::where('provider_id', $provider->id)
            ->whereBetween('scheduled_at', [$start, $end])
            ->whereNotIn('status', ['cancelled'])
            ->with(['patient', 'appointmentType'])
            ->get();

        $events = '';
        foreach ($appointments as $apt) {
            $dtStart = Carbon::parse($apt->scheduled_at)->utc()->format('Ymd\THis\Z');
            $dtEnd = Carbon::parse($apt->scheduled_at)->addMinutes($apt->duration_minutes)->utc()->format('Ymd\THis\Z');
            $summary = ($apt->appointmentType->name ?? 'Appointment') . ' - ' .
                ($apt->patient->first_name ?? '') . ' ' . ($apt->patient->last_name ?? '');

            $events .= "BEGIN:VEVENT\r\nUID:{$apt->id}@membermd.io\r\nDTSTAMP:" .
                now()->utc()->format('Ymd\THis\Z') .
                "\r\nDTSTART:{$dtStart}\r\nDTEND:{$dtEnd}\r\nSUMMARY:{$summary}\r\nSTATUS:" .
                strtoupper($apt->status) .
                "\r\nEND:VEVENT\r\n";
        }

        return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MemberMD//EN\r\nX-WR-CALNAME:MemberMD Schedule\r\n{$events}END:VCALENDAR";
    }
}
