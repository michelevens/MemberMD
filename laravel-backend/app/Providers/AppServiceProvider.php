<?php

namespace App\Providers;

use App\Models\Appointment;
use App\Models\Encounter;
use App\Models\Practice;
use App\Observers\AppointmentObserver;
use App\Observers\EncounterObserver;
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
