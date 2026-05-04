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
        'template_version', 'template_content_hash', 'membership_id',
        'signature_type', 'signature_data', 'signature_image_url',
        'signed_at', 'signed_timezone', 'signed_tz_offset_minutes',
        'ip_address', 'signed_country', 'signed_region', 'signed_city',
        'user_agent', 'device_type', 'browser_name', 'browser_version', 'os_name',
        'revoked_at', 'revoked_reason', 'revoked_by_user_id',
    ];

    protected $casts = [
        'signed_at' => 'datetime',
        'revoked_at' => 'datetime',
        'signed_tz_offset_minutes' => 'integer',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function template(): BelongsTo { return $this->belongsTo(ConsentTemplate::class, 'template_id'); }
    public function membership(): BelongsTo { return $this->belongsTo(PatientMembership::class, 'membership_id'); }
}
