<?php

namespace App\Services;

use App\Models\MedicationHistory;
use App\Models\Prescription;

class DrugInteractionService
{
    /**
     * Known major drug interaction pairs.
     * Each entry: [drug_a_keywords, drug_b_keywords, severity, description]
     */
    private const KNOWN_INTERACTIONS = [
        // Warfarin + NSAIDs — increased bleeding risk
        [['warfarin', 'coumadin'], ['ibuprofen', 'naproxen', 'aspirin', 'diclofenac', 'meloxicam', 'ketorolac', 'indomethacin', 'celecoxib'], 'major', 'Increased risk of bleeding. NSAIDs inhibit platelet function and may increase anticoagulant effect.'],
        // SSRIs + MAOIs — serotonin syndrome
        [['fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'fluvoxamine', 'venlafaxine', 'duloxetine', 'desvenlafaxine'], ['phenelzine', 'tranylcypromine', 'isocarboxazid', 'selegiline', 'rasagiline'], 'major', 'Risk of serotonin syndrome — potentially life-threatening. Combination is contraindicated.'],
        // ACE inhibitors + Potassium-sparing diuretics — hyperkalemia
        [['lisinopril', 'enalapril', 'ramipril', 'benazepril', 'captopril', 'fosinopril', 'quinapril', 'perindopril'], ['spironolactone', 'eplerenone', 'amiloride', 'triamterene'], 'major', 'Increased risk of hyperkalemia. Monitor potassium levels closely.'],
        // Statins + Fibrates — rhabdomyolysis
        [['atorvastatin', 'simvastatin', 'rosuvastatin', 'lovastatin', 'pravastatin', 'fluvastatin', 'pitavastatin'], ['gemfibrozil', 'fenofibrate', 'bezafibrate'], 'major', 'Increased risk of myopathy and rhabdomyolysis. Use with caution; consider dose reduction.'],
        // Metformin + IV Contrast — lactic acidosis
        [['metformin', 'glucophage'], ['contrast', 'iodinated contrast'], 'major', 'Risk of lactic acidosis. Hold metformin 48 hours before and after iodinated contrast administration.'],
        // Warfarin + Fluoroquinolones — increased INR
        [['warfarin', 'coumadin'], ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'norfloxacin'], 'major', 'Fluoroquinolones may increase anticoagulant effect. Monitor INR closely.'],
        // Opioids + Benzodiazepines — respiratory depression
        [['oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'tramadol', 'codeine', 'methadone', 'buprenorphine'], ['diazepam', 'alprazolam', 'lorazepam', 'clonazepam', 'midazolam', 'temazepam'], 'major', 'Combined CNS depression with risk of respiratory failure and death. FDA black box warning.'],
        // Digoxin + Amiodarone — digoxin toxicity
        [['digoxin', 'lanoxin'], ['amiodarone', 'cordarone'], 'major', 'Amiodarone increases digoxin levels by 70-100%. Reduce digoxin dose by 50% when initiating amiodarone.'],
        // Potassium + ACE inhibitors — hyperkalemia
        [['potassium', 'potassium chloride', 'k-dur', 'klor-con'], ['lisinopril', 'enalapril', 'ramipril', 'benazepril', 'captopril', 'losartan', 'valsartan', 'irbesartan'], 'moderate', 'Increased risk of hyperkalemia. Monitor serum potassium levels.'],
        // Methotrexate + NSAIDs — methotrexate toxicity
        [['methotrexate'], ['ibuprofen', 'naproxen', 'diclofenac', 'meloxicam', 'ketorolac', 'indomethacin'], 'major', 'NSAIDs reduce renal clearance of methotrexate, increasing toxicity risk.'],
        // Lithium + NSAIDs — lithium toxicity
        [['lithium', 'lithobid'], ['ibuprofen', 'naproxen', 'diclofenac', 'meloxicam', 'ketorolac', 'indomethacin', 'celecoxib'], 'major', 'NSAIDs decrease renal lithium clearance — risk of lithium toxicity. Monitor levels.'],
        // Theophylline + Fluoroquinolones — theophylline toxicity
        [['theophylline', 'aminophylline'], ['ciprofloxacin', 'norfloxacin', 'enoxacin'], 'major', 'Fluoroquinolones inhibit theophylline metabolism, increasing serum levels and toxicity risk.'],
        // Clopidogrel + PPIs — reduced antiplatelet effect
        [['clopidogrel', 'plavix'], ['omeprazole', 'esomeprazole'], 'moderate', 'Omeprazole/esomeprazole may reduce clopidogrel antiplatelet effect via CYP2C19 inhibition. Consider pantoprazole instead.'],
        // SSRIs + Triptans — serotonin syndrome
        [['fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'venlafaxine', 'duloxetine'], ['sumatriptan', 'rizatriptan', 'zolmitriptan', 'almotriptan', 'eletriptan', 'frovatriptan'], 'moderate', 'Potential risk of serotonin syndrome. Monitor for symptoms: agitation, confusion, tachycardia, hyperthermia.'],
        // Sildenafil + Nitrates — severe hypotension
        [['sildenafil', 'viagra', 'tadalafil', 'cialis', 'vardenafil'], ['nitroglycerin', 'isosorbide mononitrate', 'isosorbide dinitrate', 'amyl nitrite'], 'major', 'Combination is contraindicated. Severe, potentially fatal hypotension may occur.'],
    ];

    /**
     * Check drug interactions for a given drug against a patient's active medications.
     *
     * @return array Array of interaction warnings
     */
    public function checkInteractions(string $drugName, string $patientId, string $tenantId): array
    {
        $interactions = [];
        $drugNameLower = strtolower(trim($drugName));

        // Get active prescriptions for the patient
        $activePrescriptions = Prescription::where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->where('status', 'active')
            ->get(['medication_name']);

        // Get active medication history for the patient
        $activeMedications = MedicationHistory::where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->where('status', 'active')
            ->get(['medication_name']);

        // Combine all active medication names
        $currentMeds = collect();
        foreach ($activePrescriptions as $rx) {
            $currentMeds->push(strtolower(trim($rx->medication_name)));
        }
        foreach ($activeMedications as $med) {
            $currentMeds->push(strtolower(trim($med->medication_name)));
        }

        $currentMeds = $currentMeds->unique();

        // Check for duplicate therapy (same drug name)
        foreach ($currentMeds as $existingMed) {
            if ($this->drugsMatch($drugNameLower, $existingMed)) {
                $interactions[] = [
                    'severity' => 'moderate',
                    'description' => "Duplicate therapy detected. Patient is already on '{$existingMed}'.",
                    'interacting_drug' => $existingMed,
                ];
            }
        }

        // Check against known interaction pairs
        foreach (self::KNOWN_INTERACTIONS as [$groupA, $groupB, $severity, $description]) {
            $drugInA = $this->drugMatchesGroup($drugNameLower, $groupA);
            $drugInB = $this->drugMatchesGroup($drugNameLower, $groupB);

            if ($drugInA) {
                foreach ($currentMeds as $existingMed) {
                    if ($this->drugMatchesGroup($existingMed, $groupB)) {
                        $interactions[] = [
                            'severity' => $severity,
                            'description' => $description,
                            'interacting_drug' => $existingMed,
                        ];
                    }
                }
            }

            if ($drugInB) {
                foreach ($currentMeds as $existingMed) {
                    if ($this->drugMatchesGroup($existingMed, $groupA)) {
                        $interactions[] = [
                            'severity' => $severity,
                            'description' => $description,
                            'interacting_drug' => $existingMed,
                        ];
                    }
                }
            }
        }

        return $interactions;
    }

    /**
     * Check if two drug names refer to the same drug.
     */
    private function drugsMatch(string $drugA, string $drugB): bool
    {
        // Exact match
        if ($drugA === $drugB) {
            return true;
        }

        // One contains the other (handles brand vs generic partial matches)
        if (str_contains($drugA, $drugB) || str_contains($drugB, $drugA)) {
            return true;
        }

        // Compare first word (generic name) — handles "lisinopril 10mg" vs "lisinopril 20mg"
        $wordA = explode(' ', $drugA)[0];
        $wordB = explode(' ', $drugB)[0];

        return $wordA === $wordB && strlen($wordA) > 3;
    }

    /**
     * Check if a drug name matches any keyword in a group.
     */
    private function drugMatchesGroup(string $drugName, array $group): bool
    {
        foreach ($group as $keyword) {
            if (str_contains($drugName, $keyword)) {
                return true;
            }
        }

        return false;
    }
}
