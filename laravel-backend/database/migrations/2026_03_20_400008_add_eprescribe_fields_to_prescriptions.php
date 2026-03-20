<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            if (!Schema::hasColumn('prescriptions', 'pharmacy_id')) {
                $table->uuid('pharmacy_id')->nullable()->after('pharmacy_fax');
                $table->foreign('pharmacy_id')->references('id')->on('pharmacy_directory')->nullOnDelete();
            }
            if (!Schema::hasColumn('prescriptions', 'surescripts_message_id')) {
                $table->string('surescripts_message_id')->nullable()->after('pharmacy_id');
            }
            if (!Schema::hasColumn('prescriptions', 'eprescribe_status')) {
                $table->string('eprescribe_status')->nullable()->after('surescripts_message_id'); // pending, sent, dispensed, cancelled
            }
            if (!Schema::hasColumn('prescriptions', 'rx_reference_number')) {
                $table->string('rx_reference_number')->nullable()->after('eprescribe_status');
            }
            if (!Schema::hasColumn('prescriptions', 'drug_ndc')) {
                $table->string('drug_ndc')->nullable()->after('rx_reference_number'); // National Drug Code
            }
            if (!Schema::hasColumn('prescriptions', 'drug_interactions')) {
                $table->jsonb('drug_interactions')->nullable()->after('drug_ndc'); // array of detected interactions
            }
            if (!Schema::hasColumn('prescriptions', 'medication_source')) {
                $table->string('medication_source')->default('manual')->after('drug_interactions'); // manual, surescripts, import
            }
        });
    }

    public function down(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $columns = [
                'pharmacy_id', 'surescripts_message_id', 'eprescribe_status',
                'rx_reference_number', 'drug_ndc', 'drug_interactions', 'medication_source',
            ];
            foreach ($columns as $column) {
                if (Schema::hasColumn('prescriptions', $column)) {
                    if ($column === 'pharmacy_id') {
                        $table->dropForeign(['pharmacy_id']);
                    }
                    $table->dropColumn($column);
                }
            }
        });
    }
};
