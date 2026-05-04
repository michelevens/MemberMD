<?php

namespace App\Mail\Concerns;

use App\Models\Appointment;

/**
 * Resolves the patient-facing "join your video" link for an
 * appointment confirmation / reminder email.
 *
 * Three cases, in priority order:
 *
 *   1. The appointment's PROVIDER has a personal external video URL
 *      configured (BYOV pattern X — Zoom Personal Meeting Room,
 *      Google Meet permanent link, etc.). Use that link directly.
 *      The patient just clicks it.
 *
 *   2. The appointment is telehealth (is_telehealth = true) and we
 *      have the built-in LiveKit stack. We don't link to the LiveKit
 *      room URL directly because the patient needs an auth token,
 *      which the patient portal mints when they hit Join. So we
 *      deep-link to the patient portal's appointments tab with the
 *      appointment id; the portal resolves-and-joins on click.
 *
 *   3. In-person — no video link.
 *
 * Returns null when no link applies.
 */
trait ResolvesAppointmentVideoLink
{
    /**
     * Compute the join URL for the patient. Caller passes the
     * appointment (model with provider relation loaded if BYOV is
     * to work).
     */
    protected function resolveVideoLink(Appointment $appointment): ?string
    {
        if (!$appointment->is_telehealth) {
            return null;
        }

        // Provider's personal meeting room takes precedence (BYOV).
        $appointment->loadMissing('provider');
        $providerLink = $appointment->provider?->external_video_url;
        if (!empty($providerLink)) {
            return $providerLink;
        }

        // Fallback: deep-link to patient portal so the SPA can mint a
        // LiveKit token and route into TelehealthRoom. The portal
        // already has /#/appointments as a tab; we link there with a
        // hash arg the appointments view can read to auto-open the
        // join flow for this specific appointment id.
        $base = (string) config('app.frontend_url', config('app.url', 'https://app.membermd.io'));
        return rtrim($base, '/') . '/#/appointments?join=' . $appointment->id;
    }
}
