<?php

namespace App\Traits;

use App\Models\AuditLog;

/**
 * Trait Auditable
 * Automatically logs create/update/delete actions for HIPAA compliance.
 * Pattern adapted from ShiftPulse/EnnHealth.
 */
trait Auditable
{
    protected static function bootAuditable(): void
    {
        static::created(function ($model) {
            static::logAudit($model, 'created');
        });

        static::updated(function ($model) {
            static::logAudit($model, 'updated', $model->getOriginal(), $model->getAttributes());
        });

        static::deleted(function ($model) {
            static::logAudit($model, 'deleted');
        });
    }

    protected static function logAudit($model, string $action, array $oldValues = [], array $newValues = []): void
    {
        try {
            // Filter hidden fields (password, mfa_secret, ssn, etc.) from audit values
            $hidden = array_flip($model->getHidden());
            $oldValues = array_diff_key($oldValues, $hidden);
            $newValues = array_diff_key($newValues, $hidden);

            // Strip any column that uses an `encrypted` / `encrypted:array`
            // cast — getDirty() returns DECRYPTED values for those, which
            // would land in audit_logs.changes as plaintext PHI and defeat
            // the encryption-at-rest guarantee. Audit logs need to record
            // THAT a field changed, not what it changed TO.
            $encryptedKeys = [];
            if (method_exists($model, 'getCasts')) {
                foreach ($model->getCasts() as $col => $cast) {
                    if ($cast === 'encrypted' || str_starts_with((string) $cast, 'encrypted:')) {
                        $encryptedKeys[$col] = true;
                    }
                }
            }

            // Build changed fields list for updates
            $changes = null;
            if ($action === 'updated' && method_exists($model, 'getDirty')) {
                $dirty = $model->getDirty();
                unset($dirty['updated_at'], $dirty['created_at']);
                $dirty = array_diff_key($dirty, $hidden);
                $changes = [];
                foreach ($dirty as $field => $newVal) {
                    if (isset($encryptedKeys[$field])) {
                        // Record that the field changed, but neither value.
                        $changes[$field] = ['old' => '[redacted]', 'new' => '[redacted]'];
                        continue;
                    }
                    $changes[$field] = [
                        'old' => $oldValues[$field] ?? null,
                        'new' => $newVal,
                    ];
                }
            }

            $userId = null;
            try { $userId = auth()->id(); } catch (\Throwable $e) {}

            $tenantId = $model->tenant_id ?? null;
            try { $tenantId = $tenantId ?? auth()->user()?->tenant_id; } catch (\Throwable $e) {}

            // Use a savepoint so PostgreSQL errors don't abort the outer transaction
            \DB::connection($model->getConnectionName())->transaction(function () use ($tenantId, $userId, $action, $model, $changes) {
                AuditLog::create([
                    'tenant_id' => $tenantId,
                    'user_id' => $userId,
                    'action' => $action,
                    'resource' => class_basename($model),
                    'resource_id' => $model->id,
                    'changes' => $changes,
                    'ip_address' => request()->ip(),
                    'user_agent' => request()->userAgent(),
                ]);
            });
        } catch (\Exception $e) {
            // Silently fail — audit logging should never break app flow.
            // In testing we want the actual SQL error visible so we
            // can fix root causes; in prod the warning log is enough.
            // Tests poison the outer tx if the AuditLog::create raises
            // a pg-level error before the savepoint rolls back.
            \Log::warning('Audit log failed: ' . $e->getMessage(), [
                'model' => get_class($model),
                'action' => $action,
                'pdo_code' => $e instanceof \PDOException ? $e->getCode() : null,
                'sql' => $e instanceof \Illuminate\Database\QueryException ? $e->getSql() : null,
            ]);
            if (app()->environment('testing')) {
                // Re-throw in tests so RefreshDatabase rolls back cleanly
                // and the failing test sees the actual error instead of
                // a downstream "transaction aborted" cascade.
                throw $e;
            }
        }
    }
}
