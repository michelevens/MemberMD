<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Invoice extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'patient_id', 'membership_id',
        'stripe_invoice_id',
        'amount', 'tax', 'status',
        'description', 'line_items',
        'paid_at', 'due_date', 'pdf_url',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'tax' => 'decimal:2',
        'line_items' => 'array',
        'paid_at' => 'datetime',
        'due_date' => 'date',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function membership(): BelongsTo { return $this->belongsTo(PatientMembership::class, 'membership_id'); }
    public function payments(): HasMany { return $this->hasMany(Payment::class); }
}
