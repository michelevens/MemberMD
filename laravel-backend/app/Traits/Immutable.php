<?php

namespace App\Traits;

/**
 * Marks an audit-tier model as append-only at the application layer.
 *
 * SOC 2 CC7.2 / HIPAA 164.316 require that audit records cannot be
 * altered or deleted after they're written, so that an attacker who
 * compromises an authenticated user account can't quietly erase the
 * trail of their actions. This trait blocks updates and deletes from
 * Eloquent.
 *
 * It is *not* a substitute for database-level enforcement (revoke
 * UPDATE/DELETE on the table from the application role, or use a
 * trigger). It catches the common case — accidental or compromised
 * application code calling $log->delete() — while a hardened deploy
 * still needs the DB grant tightened separately. (See
 * docs/policy/data-retention.md.)
 */
trait Immutable
{
    protected static function bootImmutable(): void
    {
        static::updating(function () {
            throw new \RuntimeException(
                'Audit-tier records are append-only. Use a corrective entry instead of mutating the original.'
            );
        });

        static::deleting(function () {
            throw new \RuntimeException(
                'Audit-tier records are append-only. Deleting violates the 6-year HIPAA retention window.'
            );
        });
    }
}
