<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Multi-location support — practices may operate from more than one
 * physical address (multi-site groups, satellite clinics, mobile
 * units, telehealth-only "facilities" for jurisdictional billing).
 *
 * The Practice row keeps a single canonical address (the billing /
 * legal address); facilities are the patient-facing locations.
 *
 * hours: jsonb shape { mon: ["09:00","17:00"], tue: ["09:00","17:00"], ... }
 *        or null for "by appointment only".
 * services: jsonb array of human-readable strings ("Telehealth",
 *           "In-office", "Lab draw", "Vaccinations") — keeps the
 *           data model simple while allowing practice-defined labels.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('practice_facilities', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name', 200);
            $table->string('address', 255)->nullable();
            $table->string('city', 100)->nullable();
            $table->string('state', 4)->nullable();
            $table->string('zip', 16)->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email', 255)->nullable();
            $table->jsonb('hours')->nullable();
            $table->jsonb('services')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('display_order')->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_facilities');
    }
};
