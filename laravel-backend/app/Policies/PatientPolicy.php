<?php

namespace App\Policies;

use App\Models\Patient;
use App\Models\User;

class PatientPolicy extends BasePolicy
{
    /**
     * Can the user list patients?
     * superadmin/practice_admin/provider/staff: yes
     * patient: no
     */
    public function viewAny(User $user): bool
    {
        return $this->isStaffOrAbove($user);
    }

    /**
     * Can the user view this patient?
     * superadmin/practice_admin/provider/staff: same tenant
     * patient: own record only
     */
    public function view(User $user, Patient $patient): bool
    {
        if (!$this->sameTenant($user, $patient)) {
            return false;
        }

        if ($this->isPatient($user)) {
            return $this->isOwnPatientRecord($user, $patient);
        }

        return $this->isStaffOrAbove($user);
    }

    /**
     * Can the user create a patient?
     * superadmin/practice_admin/staff: yes
     * provider/patient: no
     */
    public function create(User $user): bool
    {
        return $this->isAdmin($user) || $this->isStaff($user);
    }

    /**
     * Can the user update this patient?
     * superadmin/practice_admin/staff: same tenant
     * patient: own record only
     * provider: no
     */
    public function update(User $user, Patient $patient): bool
    {
        if (!$this->sameTenant($user, $patient)) {
            return false;
        }

        if ($this->isPatient($user)) {
            return $this->isOwnPatientRecord($user, $patient);
        }

        return $this->isAdmin($user) || $this->isStaff($user);
    }

    /**
     * Can the user delete (deactivate) this patient?
     * superadmin/practice_admin: same tenant
     * all others: no
     */
    public function delete(User $user, Patient $patient): bool
    {
        if (!$this->sameTenant($user, $patient)) {
            return false;
        }

        return $this->isAdmin($user);
    }
}
