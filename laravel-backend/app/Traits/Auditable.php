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

            // Build changed fields list for updates
            $changes = null;
            if ($action === 'updated' && method_exists($model, 'getDirty')) {
                $dirty = $model->getDirty();
                unset($dirty['updated_at'], $dirty['created_at']);
                $dirty = array_diff_key($dirty, $hidden);
                $changes = [];
                foreach ($dirty as $field => $newVal) {
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
            // Silently fail — audit logging should never break app flow
            \Log::warning('Audit log failed: ' . $e->getMessage());
        }
    }
}
