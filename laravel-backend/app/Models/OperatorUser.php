<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pivot between Operator and User with an operator_role.
 *
 * Roles:
 *  - owner: full operator control, can manage other operator users
 *  - admin: read all tenants in scope, write operator config + master templates
 *  - viewer: read-only across operator scope
 */
class OperatorUser extends Model
{
    use HasFactory, HasUuids;

    public const ROLE_OWNER = 'owner';
    public const ROLE_ADMIN = 'admin';
    public const ROLE_VIEWER = 'viewer';

    public const ROLES = [self::ROLE_OWNER, self::ROLE_ADMIN, self::ROLE_VIEWER];

    protected $fillable = ['operator_id', 'user_id', 'operator_role'];

    public function operator(): BelongsTo
    {
        return $this->belongsTo(Operator::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function canWrite(): bool
    {
        return in_array($this->operator_role, [self::ROLE_OWNER, self::ROLE_ADMIN], true);
    }

    public function canManageUsers(): bool
    {
        return $this->operator_role === self::ROLE_OWNER;
    }
}
