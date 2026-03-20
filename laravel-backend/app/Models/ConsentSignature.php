<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class ConsentSignature extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'patient_id', 'template_id',
        'signature_type', 'signature_data', 'signature_image_url',
        'signed_at', 'ip_address', 'user_agent',
    ];

    protected $casts = [
        'signed_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function template(): BelongsTo { return $this->belongsTo(ConsentTemplate::class, 'template_id'); }
}
