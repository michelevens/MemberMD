<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

abstract class BasePolicy
{
    /**
     * Superadmin bypasses all checks.
     */
    public function before(User $user, string $ability): ?bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        return null;
    }

    // ── Role helpers ──────────────────────────────────────────────

    protected function isSuperAdmin(User $user): bool
    {
        return $user->role === 'superadmin';
    }

    protected function isAdmin(User $user): bool
    {
        return $user->role === 'practice_admin';
    }

    protected function isAdminOrAbove(User $user): bool
    {
        return in_array($user->role, ['superadmin', 'practice_admin']);
    }

    protected function isProviderOrAbove(User $user): bool
    {
        return in_array($user->role, ['superadmin', 'practice_admin', 'provider']);
    }

    protected function isStaffOrAbove(User $user): bool
    {
        return in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']);
    }

    protected function isProvider(User $user): bool
    {
        return $user->role === 'provider';
    }

    protected function isStaff(User $user): bool
    {
        return $user->role === 'staff';
    }

    protected function isPatient(User $user): bool
    {
        return $user->role === 'patient';
    }

    // ── Tenant helpers ────────────────────────────────────────────

    /**
     * Check that the user belongs to the same tenant as the model.
     */
    protected function sameTenant(User $user, Model $model): bool
    {
        return $user->tenant_id === $model->tenant_id;
    }

    /**
     * Check that the patient record belongs to the authenticated user.
     */
    protected function isOwnPatientRecord(User $user, Model $model): bool
    {
        if (!$user->patient) {
            return false;
        }

        // Model IS a Patient
        if ($model instanceof \App\Models\Patient) {
            return $user->patient->id === $model->id;
        }

        // Model has a patient_id column (Appointment, Encounter, Prescription, etc.)
        if (isset($model->patient_id)) {
            return $user->patient->id === $model->patient_id;
        }

        return false;
    }

    /**
     * Check that the provider record belongs to the authenticated user.
     */
    protected function isOwnProviderRecord(User $user, Model $model): bool
    {
        if (!$user->provider) {
            return false;
        }

        if (isset($model->provider_id)) {
            return $user->provider->id === $model->provider_id;
        }

        return false;
    }
}
