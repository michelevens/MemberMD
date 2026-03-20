<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class CareGap extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'patient_id', 'gap_type', 'title',
        'description', 'guideline_source', 'severity', 'status',
        'due_date', 'addressed_at', 'addressed_by', 'notes',
    ];

    protected $casts = [
        'due_date' => 'date',
        'addressed_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function addressedByUser(): BelongsTo { return $this->belongsTo(User::class, 'addressed_by'); }

    public function scopeOpen($query) { return $query->where('status', 'open'); }
    public function scopeBySeverity($query, string $severity) { return $query->where('severity', $severity); }
}
