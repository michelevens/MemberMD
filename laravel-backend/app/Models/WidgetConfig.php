<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;

class WidgetConfig extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'type', 'name', 'is_active',
        'settings', 'allowed_domains', 'notification_emails',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'settings' => 'array',
        'allowed_domains' => 'array',
        'notification_emails' => 'array',
    ];

    public function submissions(): HasMany { return $this->hasMany(WidgetSubmission::class); }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
