<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class ProviderCredential extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'provider_id',
        'type', 'name', 'credential_number', 'issuer',
        'issued_date', 'expiration_date',
        'status', 'document_url', 'notes',
        'verified_by', 'verified_at', 'reminder_sent_at',
    ];

    protected $casts = [
        'issued_date' => 'date',
        'expiration_date' => 'date',
        'verified_at' => 'datetime',
        'reminder_sent_at' => 'datetime',
    ];

    public function provider(): BelongsTo { return $this->belongsTo(User::class, 'provider_id'); }
    public function verifier(): BelongsTo { return $this->belongsTo(User::class, 'verified_by'); }
}
