<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Superadmin-only private note about a tenant. NEVER exposed to tenant
 * users. Read scope is gated to role=superadmin in the controller.
 */
class PracticeInternalNote extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'tenant_id', 'author_id', 'body', 'category',
    ];

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class, 'tenant_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}
