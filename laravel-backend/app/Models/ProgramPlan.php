<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProgramPlan extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'program_id', 'tenant_id', 'name', 'description', 'badge_text',
        'monthly_price', 'annual_price',
        'stripe_monthly_price_id', 'stripe_annual_price_id',
        'entitlements', 'features_list',
        'family_eligible', 'family_member_price',
        'min_commitment_months', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'entitlements' => 'array',
        'features_list' => 'array',
        'monthly_price' => 'decimal:2',
        'annual_price' => 'decimal:2',
        'family_member_price' => 'decimal:2',
        'family_eligible' => 'boolean',
        'is_active' => 'boolean',
        'min_commitment_months' => 'integer',
        'sort_order' => 'integer',
    ];

    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function enrollments(): HasMany { return $this->hasMany(ProgramEnrollment::class, 'plan_id'); }
}
