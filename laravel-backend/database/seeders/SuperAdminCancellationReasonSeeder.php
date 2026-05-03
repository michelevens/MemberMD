<?php

namespace Database\Seeders;

use App\Models\SuperAdminCancellationReason;
use Illuminate\Database\Seeder;

/**
 * Default cancellation reasons shown when a Practice cancels their MemberMD
 * subscription. SuperAdmin can edit/extend this list later from the portal.
 *
 * Distinct from PracticeCancellationReason (which is what a Practice shows
 * its patients when patient cancels their membership).
 */
class SuperAdminCancellationReasonSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            ['label' => 'Switching to another platform', 'sort_order' => 1],
            ['label' => 'Cost / pricing concerns', 'sort_order' => 2],
            ['label' => 'Missing features', 'sort_order' => 3],
            ['label' => 'Practice closing or pausing', 'sort_order' => 4],
            ['label' => 'Not enough members yet', 'sort_order' => 5],
            ['label' => 'Technical issues / bugs', 'sort_order' => 6],
            ['label' => 'Difficult to use', 'sort_order' => 7],
            ['label' => 'Support / responsiveness', 'sort_order' => 8],
            ['label' => 'Other', 'sort_order' => 99],
        ];

        foreach ($rows as $row) {
            SuperAdminCancellationReason::updateOrCreate(
                ['label' => $row['label']],
                array_merge($row, ['is_active' => true])
            );
        }

        $this->command->info('Seeded ' . count($rows) . ' SuperAdmin cancellation reasons.');
    }
}
