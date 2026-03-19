<?php

namespace App\Policies;

use App\Models\Appointment;
use App\Models\User;

class AppointmentPolicy extends BasePolicy
{
    /**
     * Can the user list appointments?
     * All authenticated users in the same tenant can list (filtered in controller).
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Can the user view this appointment?
     * superadmin/practice_admin/staff: same tenant
     * provider: same tenant, own appointments
     * patient: own appointments only
     */
    public function view(User $user, Appointment $appointment): bool
    {
        if (!$this->sameTenant($user, $appointment)) {
            return false;
        }

        if ($this->isPatient($user)) {
            return $this->isOwnPatientRecord($user, $appointment);
        }

        if ($this->isProvider($user)) {
            return $this->isOwnProviderRecord($user, $appointment)
                || $this->isAdmin($user);
        }

        return $this->isStaffOrAbove($user);
    }

    /**
     * Can the user create an appointment?
     * superadmin/practice_admin/provider/staff: yes
     * patient: no (patients book via separate flow)
     */
    public function create(User $user): bool
    {
        return $this->isStaffOrAbove($user);
    }

    /**
     * Can the user update this appointment?
     * superadmin/practice_admin: same tenant
     * provider: own appointments only
     * staff/patient: no
     */
    public function update(User $user, Appointment $appointment): bool
    {
        if (!$this->sameTenant($user, $appointment)) {
            return false;
        }

        if ($this->isProvider($user)) {
            return $this->isOwnProviderRecord($user, $appointment);
        }

        return $this->isAdmin($user);
    }

    /**
     * Can the user delete (cancel) this appointment?
     * superadmin/practice_admin: same tenant
     * provider: own appointments
     * staff: same tenant
     * patient: own appointments only
     */
    public function delete(User $user, Appointment $appointment): bool
    {
        if (!$this->sameTenant($user, $appointment)) {
            return false;
        }

        if ($this->isPatient($user)) {
            return $this->isOwnPatientRecord($user, $appointment);
        }

        if ($this->isProvider($user)) {
            return $this->isOwnProviderRecord($user, $appointment);
        }

        return $this->isAdmin($user) || $this->isStaff($user);
    }
}
