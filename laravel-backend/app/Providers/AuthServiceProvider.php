<?php

namespace App\Providers;

use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * The model to policy mappings for the application.
     *
     * @var array<class-string, class-string>
     */
    protected $policies = [
        \App\Models\Patient::class      => \App\Policies\PatientPolicy::class,
        \App\Models\Appointment::class   => \App\Policies\AppointmentPolicy::class,
        \App\Models\Encounter::class     => \App\Policies\EncounterPolicy::class,
        \App\Models\Prescription::class  => \App\Policies\PrescriptionPolicy::class,
        \App\Models\Message::class       => \App\Policies\MessagePolicy::class,
    ];

    /**
     * Register any authentication / authorization services.
     */
    public function boot(): void
    {
        $this->registerPolicies();
    }
}
