<?php

namespace App\Policies;

use App\Models\Prescription;
use App\Models\User;

class PrescriptionPolicy extends BasePolicy
{
    /**
     * Can the user list prescriptions?
     * All authenticated users can list (filtered by role in controller).
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Can the user view this prescription?
     * superadmin/practice_admin/provider/staff: same tenant
     * patient: own prescriptions only
     */
    public function view(User $user, Prescription $prescription): bool
    {
        if (!$this->sameTenant($user, $prescription)) {
            return false;
        }

        if ($this->isPatient($user)) {
            return $this->isOwnPatientRecord($user, $prescription);
        }

        return $this->isStaffOrAbove($user);
    }

    /**
     * Can the user create a prescription?
     * superadmin/practice_admin/provider: yes
     * staff/patient: no
     */
    public function create(User $user): bool
    {
        return $this->isProviderOrAbove($user);
    }

    /**
     * Can the user update this prescription?
     * superadmin/practice_admin/provider: same tenant
     * staff/patient: no
     */
    public function update(User $user, Prescription $prescription): bool
    {
        if (!$this->sameTenant($user, $prescription)) {
            return false;
        }

        return $this->isProviderOrAbove($user);
    }

    /**
     * Can the user request a refill?
     * superadmin/practice_admin/provider: same tenant (always)
     * staff: same tenant
     * patient: own prescriptions only
     */
    public function requestRefill(User $user, Prescription $prescription): bool
    {
        if (!$this->sameTenant($user, $prescription)) {
            return false;
        }

        if ($this->isPatient($user)) {
            return $this->isOwnPatientRecord($user, $prescription);
        }

        return $this->isStaffOrAbove($user);
    }

    /**
     * Can the user process (approve/deny) a refill?
     * superadmin/practice_admin/provider: same tenant
     * staff/patient: no
     */
    public function processRefill(User $user, Prescription $prescription): bool
    {
        if (!$this->sameTenant($user, $prescription)) {
            return false;
        }

        return $this->isProviderOrAbove($user);
    }

    /**
     * Can the user generate a PDF or eFax?
     * superadmin/practice_admin/provider: same tenant
     * staff/patient: no
     */
    public function generatePdf(User $user, Prescription $prescription): bool
    {
        if (!$this->sameTenant($user, $prescription)) {
            return false;
        }

        return $this->isProviderOrAbove($user);
    }

    /**
     * Can the user eFax this prescription?
     * superadmin/practice_admin/provider: same tenant
     * staff/patient: no
     */
    public function efax(User $user, Prescription $prescription): bool
    {
        if (!$this->sameTenant($user, $prescription)) {
            return false;
        }

        return $this->isProviderOrAbove($user);
    }
}
