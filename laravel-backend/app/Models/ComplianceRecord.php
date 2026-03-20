<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class ComplianceRecord extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'requirement_id',
        'status', 'evidence', 'notes',
        'reviewed_by', 'reviewed_at', 'next_review_date',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
        'next_review_date' => 'date',
    ];

    public function requirement(): BelongsTo { return $this->belongsTo(ComplianceRequirement::class, 'requirement_id'); }
    public function reviewer(): BelongsTo { return $this->belongsTo(User::class, 'reviewed_by'); }
}
