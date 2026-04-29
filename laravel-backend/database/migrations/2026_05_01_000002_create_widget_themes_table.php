<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('widget_themes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('scope', 32)->default('all'); // all | enrollment | plans | booking
            $table->json('css_variables')->nullable();    // {primary, secondary, text, bg, surface, ...}
            $table->text('custom_css')->nullable();       // sanitized custom CSS escape hatch
            $table->string('font_family', 100)->nullable();
            $table->json('logo')->nullable();             // {url, position, max_height}
            $table->json('settings')->nullable();         // misc per-scope flags
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
            $table->unique(['tenant_id', 'scope']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('widget_themes');
    }
};
