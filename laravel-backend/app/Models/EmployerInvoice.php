<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class EmployerInvoice extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'employer_id', 'contract_id',
        'invoice_number', 'period_start', 'period_end',
        'enrolled_count', 'pepm_rate', 'subtotal', 'adjustments', 'total',
        'status', 'due_date', 'paid_at',
        'payment_method', 'payment_reference', 'notes',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'enrolled_count' => 'integer',
        'pepm_rate' => 'decimal:2',
        'subtotal' => 'decimal:2',
        'adjustments' => 'decimal:2',
        'total' => 'decimal:2',
        'due_date' => 'date',
        'paid_at' => 'datetime',
    ];

    public function employer(): BelongsTo { return $this->belongsTo(Employer::class); }
    public function contract(): BelongsTo { return $this->belongsTo(EmployerContract::class, 'contract_id'); }
}
