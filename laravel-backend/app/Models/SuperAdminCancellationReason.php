<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Reasons a Practice can pick when cancelling their MemberMD subscription.
 * Platform-wide list curated by SuperAdmin (no tenant_id).
 *
 * Distinct from PracticeCancellationReason (tenant-scoped, practice-curated,
 * shown to patients).
 */
class SuperAdminCancellationReason extends Model
{
    use HasFactory, HasUuids, Auditable, SoftDeletes;

    // Eloquent's snake-cased convention from the class name would resolve
    // to `super_admin_cancellation_reasons` (with an extra underscore)
    // but the migration created `superadmin_cancellation_reasons`. Pin
    // the table name explicitly so queries match.
    protected $table = 'superadmin_cancellation_reasons';

    protected $fillable = ['label', 'description', 'sort_order', 'is_active'];

    protected $casts = [
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];
}
