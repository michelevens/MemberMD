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
     * patient: yes — self-booking opened up. The controller forces
     *   patient_id to the caller's own record and stamps the new
     *   appointment as 'scheduled' with confirmed_at=null so staff
     *   know it needs review.
     */
    public function create(User $user): bool
    {
        return $this->isStaffOrAbove($user) || $this->isPatient($user);
    }

    /**
     * Can the user update this appointment?
     * superadmin/practice_admin: same tenant
     * provider: own appointments only
     * staff: same tenant (confirm / reschedule on behalf of patient)
     * patient: own appointments only, AND only while not yet completed
     *   (reschedule path; the controller restricts which fields they
     *   can change so they can't reassign provider, change duration, etc.)
     */
    public function update(User $user, Appointment $appointment): bool
    {
        if (!$this->sameTenant($user, $appointment)) {
            return false;
        }

        if ($this->isPatient($user)) {
            if (!$this->isOwnPatientRecord($user, $appointment)) {
                return false;
            }
            // Once the visit happened we're past the point of patient edits.
            return !in_array($appointment->status, ['completed', 'in_progress', 'checked_in', 'cancelled', 'no_show'], true);
        }

        if ($this->isProvider($user)) {
            return $this->isOwnProviderRecord($user, $appointment);
        }

        return $this->isAdmin($user) || $this->isStaff($user);
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
