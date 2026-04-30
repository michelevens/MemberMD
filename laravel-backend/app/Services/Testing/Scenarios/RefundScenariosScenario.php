<?php

namespace App\Services\Testing\Scenarios;

use App\Models\PatientMembership;
use App\Models\Payment;
use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

class RefundScenariosScenario extends BaseScenario
{
    public function tenantCode(): string { return 'REFUND'; }
    public function tenantName(): string { return 'Refund Test Practice'; }
    public function description(): string { return 'Patients with mixed refund states: full, partial, multi-refund, with credits. Tests refund ledger.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();

        $p1 = $r->createPatient([
            'first_name' => 'Full', 'last_name' => 'RefundCustomer',
            'plan_key' => 'complete', 'months_ago' => 4, 'status' => 'active',
        ]);
        $lastPayment = Payment::where('patient_id', $p1->id)->orderByDesc('created_at')->first();
        if ($lastPayment) $r->partialRefund($lastPayment, (float) $lastPayment->amount, 'requested_by_customer');

        $p2 = $r->createPatient([
            'first_name' => 'Partial', 'last_name' => 'RefundCustomer',
            'plan_key' => 'complete', 'months_ago' => 3, 'status' => 'active',
        ]);
        $lastPayment2 = Payment::where('patient_id', $p2->id)->orderByDesc('created_at')->first();
        if ($lastPayment2) $r->partialRefund($lastPayment2, 50, 'duplicate');

        $p3 = $r->createPatient([
            'first_name' => 'Multi', 'last_name' => 'RefundCustomer',
            'plan_key' => 'complete', 'months_ago' => 5, 'status' => 'active',
        ]);
        $lastPayment3 = Payment::where('patient_id', $p3->id)->orderByDesc('created_at')->first();
        if ($lastPayment3) {
            $r->partialRefund($lastPayment3, 30, 'requested_by_customer');
            $r->partialRefund($lastPayment3, 50, 'duplicate');
        }

        $p4 = $r->createPatient([
            'first_name' => 'Credit', 'last_name' => 'Holder',
            'plan_key' => 'wellness', 'months_ago' => 4, 'status' => 'active',
            'patient_login' => true,
        ]);
        $m4 = PatientMembership::where('patient_id', $p4->id)->first();
        if ($m4) {
            $r->issueCredit($m4, 50, 'comp', 'Holiday courtesy comp');
            $r->issueCredit($m4, 25, 'write_off', 'Service issue write-off');
        }
    }
}
