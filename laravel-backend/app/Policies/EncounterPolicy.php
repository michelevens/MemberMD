<?php

namespace App\Policies;

use App\Models\Encounter;
use App\Models\User;

class EncounterPolicy extends BasePolicy
{
    /**
     * Can the user list encounters?
     * All authenticated users can list (filtered by role in controller).
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Can the user view this encounter?
     * superadmin/practice_admin/provider/staff: same tenant
     * patient: own encounters only
     */
    public function view(User $user, Encounter $encounter): bool
    {
        if (!$this->sameTenant($user, $encounter)) {
            return false;
        }

        if ($this->isPatient($user)) {
            return $this->isOwnPatientRecord($user, $encounter);
        }

        return $this->isStaffOrAbove($user);
    }

    /**
     * Can the user create an encounter?
     * superadmin/practice_admin/provider: yes (clinical privilege)
     * staff/patient: no
     */
    public function create(User $user): bool
    {
        return $this->isProviderOrAbove($user);
    }

    /**
     * Can the user update this encounter?
     * superadmin/practice_admin/provider: same tenant (clinical privilege)
     * staff/patient: no
     */
    public function update(User $user, Encounter $encounter): bool
    {
        if (!$this->sameTenant($user, $encounter)) {
            return false;
        }

        return $this->isProviderOrAbove($user);
    }

    /**
     * Can the user sign this encounter?
     * superadmin/practice_admin/provider: same tenant
     * staff/patient: no
     */
    public function sign(User $user, Encounter $encounter): bool
    {
        if (!$this->sameTenant($user, $encounter)) {
            return false;
        }

        return $this->isProviderOrAbove($user);
    }
}
