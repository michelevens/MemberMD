<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class SmsOptIn extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $table = 'sms_opt_ins';

    protected $fillable = [
        'tenant_id', 'patient_id', 'phone_number',
        'opted_in', 'opted_in_at', 'opted_out_at',
    ];

    protected $casts = [
        'opted_in' => 'boolean',
        'opted_in_at' => 'datetime',
        'opted_out_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function practice(): BelongsTo { return $this->belongsTo(Practice::class, 'tenant_id'); }
}
