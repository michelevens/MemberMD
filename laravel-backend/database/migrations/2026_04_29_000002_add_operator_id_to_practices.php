<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('practices', function (Blueprint $table) {
            $table->uuid('operator_id')->nullable()->after('id');
            $table->index('operator_id');
        });

        // Backfill: every existing practice gets a default Operator. Per ADR-0001
        // (tenant-of-one), solo practices live under a 1-tenant operator just
        // like multi-clinic operators — no special-casing in app code.
        $practices = DB::table('practices')->get(['id', 'name', 'slug', 'email']);

        foreach ($practices as $practice) {
            $operatorId = (string) Str::uuid();
            $slug = $this->uniqueOperatorSlug($practice->slug ?? Str::slug($practice->name));

            DB::table('operators')->insert([
                'id' => $operatorId,
                'name' => $practice->name,
                'slug' => $slug,
                'contact_email' => $practice->email,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('practices')
                ->where('id', $practice->id)
                ->update(['operator_id' => $operatorId]);
        }

        // Add FK constraint. Column stays nullable at the DB level for SQLite
        // compatibility (Laravel migrations can't reliably ->change() on
        // SQLite without doctrine/dbal). At runtime, the Practice model's
        // creating hook guarantees operator_id is always set.
        Schema::table('practices', function (Blueprint $table) {
            $table->foreign('operator_id')->references('id')->on('operators')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('practices', function (Blueprint $table) {
            $table->dropForeign(['operator_id']);
            $table->dropIndex(['operator_id']);
            $table->dropColumn('operator_id');
        });
    }

    private function uniqueOperatorSlug(string $base): string
    {
        $base = $base !== '' ? $base : 'operator';
        $slug = $base;
        $i = 1;
        while (DB::table('operators')->where('slug', $slug)->exists()) {
            $i++;
            $slug = "{$base}-{$i}";
        }
        return $slug;
    }
};
