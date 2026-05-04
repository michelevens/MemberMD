<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bring-your-own-video columns on providers.
 *
 * Lets a provider opt out of the built-in LiveKit telehealth room
 * and use their own static meeting link instead — Zoom Personal
 * Meeting Room, Google Meet permanent link, Microsoft Teams link,
 * etc. When external_video_url is set on the provider, every
 * telehealth appointment for that provider gets that link instead
 * of a freshly-minted LiveKit room.
 *
 *   external_video_url  full https URL the patient opens to join
 *                       (validated server-side at booking time)
 *   video_provider      informational label so the UI can show
 *                       a vendor icon (zoom / google_meet / teams /
 *                       other). NOT used for routing — the URL is.
 *
 * This is "Pattern X" from the v1 telehealth design — a single
 * static link per provider. "Pattern Y" (per-appointment OAuth-
 * minted links via Zoom/Google APIs) is a Tier-4 follow-up.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('providers', function (Blueprint $table) {
            if (!Schema::hasColumn('providers', 'external_video_url')) {
                $table->string('external_video_url', 500)->nullable()->after('telehealth_enabled');
            }
            if (!Schema::hasColumn('providers', 'video_provider')) {
                $table->string('video_provider', 32)->nullable()->after('external_video_url');
            }
        });
    }

    public function down(): void
    {
        Schema::table('providers', function (Blueprint $table) {
            $cols = ['external_video_url', 'video_provider'];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('providers', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
