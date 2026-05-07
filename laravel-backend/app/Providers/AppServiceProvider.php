<?php

namespace App\Providers;

use App\Events\MembershipStateChanged;
use App\Listeners\DispatchMembershipWebhook;
use App\Listeners\LogMembershipTransition;
use App\Models\Appointment;
use App\Models\DispenseRecord;
use App\Models\Encounter;
use App\Models\LabOrder;
use App\Models\Practice;
use App\Observers\AppointmentObserver;
use App\Observers\DispenseRecordObserver;
use App\Observers\EncounterObserver;
use App\Observers\LabOrderObserver;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Appointment::observe(AppointmentObserver::class);
        Encounter::observe(EncounterObserver::class);
        LabOrder::observe(LabOrderObserver::class);
        DispenseRecord::observe(DispenseRecordObserver::class);

        // Sentry before_send PHI scrubber. Registered at runtime instead
        // of in config/sentry.php because closures can't be serialized
        // by `php artisan config:cache` (Railway runs that on every
        // deploy, fails the build otherwise). Wires the scrubber onto
        // the active Sentry client when one exists. No-op when Sentry
        // isn't bound (local dev, tests, missing DSN).
        try {
            $client = \Sentry\SentrySdk::getCurrentHub()->getClient();
            if ($client !== null) {
                $client->getOptions()->setBeforeSendCallback(
                    static function (\Sentry\Event $event, ?\Sentry\EventHint $hint = null): ?\Sentry\Event {
                        try {
                            return app(\App\Services\SentryScrubber::class)($event, $hint);
                        } catch (\Throwable) {
                            // Better to send the unscrubbed event than
                            // lose a real bug report. Flip to `return null`
                            // once we have paying customers and dropping
                            // beats leaking.
                            return $event;
                        }
                    }
                );
            }
        } catch (\Throwable) {
            // Sentry SDK not loaded yet / not configured — silent no-op.
        }

        // Lifecycle → outbound webhooks bridge. Every membership state
        // transition fires MembershipStateChanged; the listener fans it
        // out to any practice-registered webhook endpoint subscribed to
        // the resulting event type.
        Event::listen(MembershipStateChanged::class, DispatchMembershipWebhook::class);

        // Lifecycle → durable transition log. Synchronous so the row is
        // visible to readers immediately after the request returns.
        Event::listen(MembershipStateChanged::class, LogMembershipTransition::class);

        // Per-practice branding for transactional email templates.
        // Pattern adapted from ShiftPulse: a single composer makes
        // tenant context available to every emails.* view, so each
        // Mailable doesn't have to remember to pass branding fields.
        View::composer('emails.*', function ($view) {
            $existing = $view->getData();
            $practice = $existing['practice'] ?? null;

            // Fallback: auth user's practice (when an action triggers a
            // mail and the Mailable didn't explicitly pass `practice`).
            if (!$practice && auth()->check() && auth()->user()->tenant_id) {
                $practice = Practice::find(auth()->user()->tenant_id);
            }

            $branding = (array) ($practice?->branding ?? []);

            $view->with([
                'practiceName' => $existing['practiceName'] ?? $practice?->name ?? config('app.name', 'MemberMD'),
                'practiceEmail' => $existing['practiceEmail'] ?? $practice?->email ?? null,
                'practicePhone' => $existing['practicePhone'] ?? $practice?->phone ?? null,
                'primaryColor' => $existing['primaryColor'] ?? $branding['primary_color'] ?? '#27ab83',
                'accentColor' => $existing['accentColor'] ?? $branding['accent_color'] ?? '#102a43',
                'logoUrl' => $existing['logoUrl'] ?? $branding['logo_url'] ?? null,
                'frontendUrl' => $existing['frontendUrl'] ?? env('FRONTEND_URL', 'https://app.membermd.io'),
            ]);
        });
    }
}
