<?php

namespace Tests\Feature;

use App\Models\ExternalBusyBlock;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\User;
use App\Services\ExternalCalendarSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Coverage for the personal-calendar (Path A) iCal pull. Tests the
 * controller endpoints (status / set / sync), auth boundaries, and
 * the sync service against fixtured iCal payloads served by Http::fake.
 */
class ExternalCalendarSyncTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ──────────────────────────────────────────────────

    private function createPractice(): Practice
    {
        return Practice::create([
            'name' => 'Test Practice',
            'slug' => 'tp-' . uniqid(),
            'email' => 'admin@tp.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
        ]);
    }

    private function createUser(Practice $practice, string $role = 'provider'): User
    {
        return User::create([
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => $role,
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'status' => 'active',
        ]);
    }

    private function createProvider(Practice $practice): array
    {
        $user = $this->createUser($practice, 'provider');
        $provider = Provider::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'npi' => '1234567890',
            'credentials' => 'MD',
            'panel_status' => 'open',
            'accepts_new_patients' => true,
        ]);
        return [$provider, $user];
    }

    /**
     * Build a minimal valid iCal payload so the parser has something
     * deterministic to chew on. Each event in $events is shaped:
     *  ['uid' => ..., 'summary' => ..., 'start' => DateTime, 'end' => DateTime]
     */
    private function makeIcs(array $events): string
    {
        $vevents = '';
        foreach ($events as $e) {
            $start = $e['start']->format('Ymd\THis\Z');
            $end = $e['end']->format('Ymd\THis\Z');
            $vevents .= "BEGIN:VEVENT\r\n"
                . "UID:{$e['uid']}\r\n"
                . "DTSTAMP:{$start}\r\n"
                . "DTSTART:{$start}\r\n"
                . "DTEND:{$end}\r\n"
                . "SUMMARY:{$e['summary']}\r\n"
                . "END:VEVENT\r\n";
        }
        return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n{$vevents}END:VCALENDAR\r\n";
    }

    // ── Endpoint auth tests ──────────────────────────────────────

    public function test_status_endpoint_returns_disconnected_by_default(): void
    {
        $practice = $this->createPractice();
        [$provider, $user] = $this->createProvider($practice);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson("/api/providers/{$provider->id}/external-calendar");

        $response->assertStatus(200)
            ->assertJsonPath('data.connected', false)
            ->assertJsonPath('data.busy_block_count', 0);
    }

    public function test_set_url_requires_provider_self(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $otherProviderUser = $this->createUser($practice, 'provider');

        // Different provider tries to set someone else's URL.
        $response = $this->actingAs($otherProviderUser, 'sanctum')
            ->putJson("/api/providers/{$provider->id}/external-calendar", [
                'url' => 'https://example.com/cal.ics',
            ]);

        $response->assertStatus(403);
    }

    public function test_set_url_rejects_invalid_scheme(): void
    {
        $practice = $this->createPractice();
        [$provider, $user] = $this->createProvider($practice);

        $response = $this->actingAs($user, 'sanctum')
            ->putJson("/api/providers/{$provider->id}/external-calendar", [
                'url' => 'ftp://no.thanks/cal.ics',
            ]);

        $response->assertStatus(422);
    }

    public function test_set_url_accepts_webcal_scheme(): void
    {
        $practice = $this->createPractice();
        [$provider, $user] = $this->createProvider($practice);

        $response = $this->actingAs($user, 'sanctum')
            ->putJson("/api/providers/{$provider->id}/external-calendar", [
                'url' => 'webcal://p01.icloud.com/published/2/abc123',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.connected', true);

        $this->assertNotNull($provider->fresh()->external_calendar_url);
    }

    public function test_clear_url_wipes_busy_blocks(): void
    {
        $practice = $this->createPractice();
        [$provider, $user] = $this->createProvider($practice);
        $provider->update(['external_calendar_url' => 'https://example.com/cal.ics']);

        // Pre-seed a block that should be cleared.
        ExternalBusyBlock::create([
            'tenant_id' => $practice->id,
            'provider_id' => $provider->id,
            'external_uid' => 'prior-event',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDay()->addHour(),
            'all_day' => false,
            'last_seen_at' => now(),
        ]);
        $this->assertEquals(1, ExternalBusyBlock::where('provider_id', $provider->id)->count());

        $response = $this->actingAs($user, 'sanctum')
            ->putJson("/api/providers/{$provider->id}/external-calendar", ['url' => null]);

        $response->assertStatus(200)
            ->assertJsonPath('data.connected', false);
        $this->assertEquals(0, ExternalBusyBlock::where('provider_id', $provider->id)->count());
    }

    public function test_sync_endpoint_returns_422_when_no_url_set(): void
    {
        $practice = $this->createPractice();
        [$provider, $user] = $this->createProvider($practice);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson("/api/providers/{$provider->id}/external-calendar/sync");

        $response->assertStatus(422);
    }

    // ── Sync service behavior ────────────────────────────────────

    public function test_sync_imports_events_from_remote_ics(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $url = 'https://example.com/personal.ics';
        $provider->update(['external_calendar_url' => $url]);

        $start = now()->addDays(2)->setTime(10, 0)->utc();
        $end = (clone $start)->addHour();

        Http::fake([
            $url => Http::response($this->makeIcs([
                ['uid' => 'event-1', 'summary' => 'Dentist', 'start' => $start, 'end' => $end],
            ])),
        ]);

        $service = new ExternalCalendarSync();
        $result = $service->syncProvider($provider->fresh());

        $this->assertEquals('ok', $result['status']);
        $this->assertEquals(1, $result['count']);
        $this->assertEquals(1, ExternalBusyBlock::where('provider_id', $provider->id)->count());
        $this->assertEquals('ok', $provider->fresh()->external_calendar_sync_status);
        $this->assertNotNull($provider->fresh()->external_calendar_synced_at);
    }

    public function test_sync_upserts_by_external_uid_on_subsequent_runs(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $url = 'https://example.com/personal.ics';
        $provider->update(['external_calendar_url' => $url]);

        $start = now()->addDays(2)->setTime(10, 0)->utc();
        $end = (clone $start)->addHour();

        // Use a sequence so the same URL returns different bodies on
        // successive calls. Cleaner than two Http::fake() calls,
        // which Laravel treats as additive (first match wins).
        Http::fake([
            $url => Http::sequence()
                ->push($this->makeIcs([
                    ['uid' => 'event-1', 'summary' => 'Dentist', 'start' => $start, 'end' => $end],
                ]))
                ->push($this->makeIcs([
                    ['uid' => 'event-1', 'summary' => 'Dentist (rescheduled)', 'start' => $start, 'end' => (clone $start)->addHours(2)],
                ])),
        ]);

        $service = new ExternalCalendarSync();
        $service->syncProvider($provider->fresh());
        $this->assertEquals(1, ExternalBusyBlock::where('provider_id', $provider->id)->count());

        // Second sync — same UID with different summary. Should
        // UPDATE in place, not duplicate.
        $service->syncProvider($provider->fresh());
        $this->assertEquals(1, ExternalBusyBlock::where('provider_id', $provider->id)->count());

        $row = ExternalBusyBlock::where('provider_id', $provider->id)->first();
        $this->assertEquals('Dentist (rescheduled)', $row->summary);
    }

    public function test_sync_prunes_blocks_not_seen_in_latest_pull(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $url = 'https://example.com/personal.ics';
        $provider->update(['external_calendar_url' => $url]);

        $start1 = now()->addDays(2)->setTime(10, 0)->utc();
        $end1 = (clone $start1)->addHour();
        $start2 = now()->addDays(3)->setTime(14, 0)->utc();
        $end2 = (clone $start2)->addHour();

        // Sequence of two responses for the same URL. First sync sees
        // both events; second sync sees only event-1, so event-2 is
        // pruned.
        Http::fake([
            $url => Http::sequence()
                ->push($this->makeIcs([
                    ['uid' => 'event-1', 'summary' => 'A', 'start' => $start1, 'end' => $end1],
                    ['uid' => 'event-2', 'summary' => 'B', 'start' => $start2, 'end' => $end2],
                ]))
                ->push($this->makeIcs([
                    ['uid' => 'event-1', 'summary' => 'A', 'start' => $start1, 'end' => $end1],
                ])),
        ]);

        $service = new ExternalCalendarSync();
        $service->syncProvider($provider->fresh());
        $this->assertEquals(2, ExternalBusyBlock::where('provider_id', $provider->id)->count());

        $service->syncProvider($provider->fresh());
        $this->assertEquals(1, ExternalBusyBlock::where('provider_id', $provider->id)->count());
        $this->assertEquals('event-1', ExternalBusyBlock::where('provider_id', $provider->id)->first()->external_uid);
    }

    public function test_sync_marks_status_error_on_404(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $url = 'https://example.com/missing.ics';
        $provider->update(['external_calendar_url' => $url]);

        Http::fake([$url => Http::response('not found', 404)]);

        $service = new ExternalCalendarSync();
        $result = $service->syncProvider($provider->fresh());

        $this->assertEquals('error', $result['status']);
        $this->assertEquals('error', $provider->fresh()->external_calendar_sync_status);
        $this->assertStringContainsString('HTTP 404', $provider->fresh()->external_calendar_sync_error);
    }

    public function test_sync_marks_status_error_on_garbage_response(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $url = 'https://example.com/garbage.ics';
        $provider->update(['external_calendar_url' => $url]);

        Http::fake([$url => Http::response('this is not iCal', 200)]);

        $service = new ExternalCalendarSync();
        $result = $service->syncProvider($provider->fresh());

        $this->assertEquals('error', $result['status']);
        $this->assertStringContainsString('iCal', $provider->fresh()->external_calendar_sync_error);
    }

    public function test_sync_skips_when_no_url_set(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        // No external_calendar_url.

        $service = new ExternalCalendarSync();
        $result = $service->syncProvider($provider->fresh());

        $this->assertEquals('skipped', $result['status']);
        $this->assertEquals('no_url', $result['reason']);
    }

    public function test_sync_rewrites_webcal_to_https_at_fetch_time(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $webcalUrl = 'webcal://example.com/cal.ics';
        $provider->update(['external_calendar_url' => $webcalUrl]);

        // The service should fetch from the https variant.
        $start = now()->addDay()->setTime(9, 0)->utc();
        $end = (clone $start)->addHour();
        Http::fake([
            'https://example.com/cal.ics' => Http::response($this->makeIcs([
                ['uid' => 'wc-1', 'summary' => 'Webcal test', 'start' => $start, 'end' => $end],
            ])),
        ]);

        $service = new ExternalCalendarSync();
        $result = $service->syncProvider($provider->fresh());

        $this->assertEquals('ok', $result['status']);
        $this->assertEquals(1, $result['count']);
    }
}
