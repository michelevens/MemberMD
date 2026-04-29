<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A custom domain claimed by a Practice for serving white-labeled widgets
 * (e.g., enroll.theirbrand.com).
 *
 * Per docs/integrations/embeddable-widgets.md, ownership is verified via TXT
 * DNS record before the domain becomes routable. Unverified domains can sit
 * in this table indefinitely; only verified rows are used for Host-header
 * resolution.
 */
class TenantDomain extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    public const SSL_PENDING = 'pending';
    public const SSL_ACTIVE = 'active';
    public const SSL_FAILED = 'failed';

    protected $fillable = [
        'tenant_id', 'domain', 'verification_token', 'verification_method',
        'verified_at', 'ssl_status', 'is_primary', 'is_active', 'settings',
    ];

    protected $casts = [
        'verified_at' => 'datetime',
        'is_primary' => 'boolean',
        'is_active' => 'boolean',
        'settings' => 'array',
    ];

    public function isVerified(): bool
    {
        return $this->verified_at !== null;
    }

    public function expectedTxtValue(): string
    {
        return 'membermd-verify=' . $this->verification_token;
    }

    public function txtRecordHost(): string
    {
        // Convention: TXT goes on _membermd.<domain> to keep the apex clean
        return "_membermd.{$this->domain}";
    }

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class, 'tenant_id');
    }
}
