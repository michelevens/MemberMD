<?php

namespace App\Services;

use App\Models\MasterPlanTemplate;
use App\Models\MembershipPlan;
use App\Models\Practice;
use App\Models\TenantPlanOverride;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The lifecycle service for operator plan templates ↔ tenant plans.
 *
 * Inheritance is hybrid:
 *  - apply()  — eager-copy template defaults into a tenant plan (and link it).
 *  - sync()   — push current template defaults into a linked plan, but only
 *               for fields the tenant has NOT overridden.
 *  - applyOverrides() — validate and apply tenant edits to a linked plan;
 *               locked fields are rejected; price bounds enforced.
 *
 * All mutations run in a DB transaction to keep the plan + overrides table
 * consistent.
 */
class PlanSyncService
{
    /**
     * Apply a template to a tenant plan for the first time. Creates the
     * MembershipPlan if needed, otherwise updates existing.
     *
     * Returns the resulting plan with template_link populated.
     */
    public function apply(MasterPlanTemplate $template, Practice $tenant, ?MembershipPlan $existingPlan = null): MembershipPlan
    {
        $this->assertTemplateBelongsToOperator($template, $tenant);

        return DB::transaction(function () use ($template, $tenant, $existingPlan) {
            $defaults = $template->defaultsAsPlanAttributes();

            $attributes = array_merge($defaults, [
                'tenant_id' => $tenant->id,
                'master_template_id' => $template->id,
                'template_version_applied' => $template->version,
                'is_synced_with_template' => true,
                'template_last_synced_at' => now(),
                'is_active' => true,
            ]);

            if ($existingPlan) {
                // Replacing an existing plan with a template attachment —
                // wipe any prior override records since this is a fresh attach.
                $existingPlan->update($attributes);
                TenantPlanOverride::where('plan_id', $existingPlan->id)->delete();
                return $existingPlan->fresh();
            }

            return MembershipPlan::create($attributes);
        });
    }

    /**
     * Push the latest template defaults into a tenant plan, preserving any
     * fields the tenant has already overridden.
     */
    public function sync(MembershipPlan $plan): MembershipPlan
    {
        if (!$plan->isFromTemplate()) {
            throw new \RuntimeException("Plan {$plan->id} is not derived from a template.");
        }

        return DB::transaction(function () use ($plan) {
            $template = $plan->masterTemplate()->firstOrFail();
            $overriddenFields = TenantPlanOverride::where('plan_id', $plan->id)
                ->pluck('field_name')
                ->all();

            $defaults = $template->defaultsAsPlanAttributes();
            $patch = [];
            foreach ($defaults as $field => $value) {
                if (!in_array($field, $overriddenFields, true)) {
                    $patch[$field] = $value;
                }
            }

            $patch['template_version_applied'] = $template->version;
            $patch['template_last_synced_at'] = now();
            $patch['is_synced_with_template'] = empty($overriddenFields);

            $plan->update($patch);
            return $plan->fresh();
        });
    }

    /**
     * Apply tenant-side edits to a plan. Validates against the lock matrix
     * and price bounds. Records overrides for any non-locked field that
     * diverges from the template default.
     *
     * Throws ValidationException if a locked field is being changed or if a
     * bounded price is out of range.
     *
     * @param  array<string, mixed>  $changes  Fields the tenant wants to update
     */
    public function applyOverrides(MembershipPlan $plan, array $changes, ?string $userId = null): MembershipPlan
    {
        if (!$plan->isFromTemplate()) {
            // Standalone plan — no validation needed beyond the controller's
            // own rules. Just apply.
            $plan->update($changes);
            return $plan->fresh();
        }

        $template = $plan->masterTemplate()->firstOrFail();
        $errors = [];

        foreach ($changes as $field => $newValue) {
            if (!in_array($field, MasterPlanTemplate::LOCKABLE_FIELDS, true)) {
                continue;
            }

            if ($template->isFieldLocked($field)) {
                $errors[$field] = ["This field is locked by the operator template and cannot be changed."];
                continue;
            }

            // Price bounds check
            if ($field === 'monthly_price') {
                $err = $this->checkPriceBounds($newValue, $template->monthly_price_min, $template->monthly_price_max);
                if ($err) $errors[$field] = [$err];
            }
            if ($field === 'annual_price' && $newValue !== null) {
                $err = $this->checkPriceBounds($newValue, $template->annual_price_min, $template->annual_price_max);
                if ($err) $errors[$field] = [$err];
            }
        }

        if (!empty($errors)) {
            throw ValidationException::withMessages($errors);
        }

        return DB::transaction(function () use ($plan, $changes, $template, $userId) {
            $defaults = $template->defaultsAsPlanAttributes();

            foreach ($changes as $field => $newValue) {
                if (!in_array($field, MasterPlanTemplate::LOCKABLE_FIELDS, true)) {
                    continue;
                }

                $originalValue = $defaults[$field] ?? null;

                if ($this->valuesEqual($originalValue, $newValue)) {
                    // Reset to template — clear any prior override
                    TenantPlanOverride::where('plan_id', $plan->id)
                        ->where('field_name', $field)
                        ->delete();
                } else {
                    TenantPlanOverride::updateOrCreate(
                        [
                            'plan_id' => $plan->id,
                            'field_name' => $field,
                        ],
                        [
                            'tenant_id' => $plan->tenant_id,
                            'master_template_id' => $template->id,
                            'original_value' => ['value' => $originalValue],
                            'override_value' => ['value' => $newValue],
                            'overridden_by' => $userId,
                        ]
                    );
                }
            }

            $plan->update($changes);

            // Recompute is_synced_with_template flag
            $hasOverrides = TenantPlanOverride::where('plan_id', $plan->id)->exists();
            $plan->update(['is_synced_with_template' => !$hasOverrides]);

            return $plan->fresh();
        });
    }

    /**
     * Reset specific overridden fields back to the template default. Pass
     * null to reset all overrides on the plan.
     *
     * @param  array<int, string>|null  $fields
     */
    public function resetToTemplate(MembershipPlan $plan, ?array $fields = null): MembershipPlan
    {
        if (!$plan->isFromTemplate()) {
            throw new \RuntimeException("Plan {$plan->id} is not derived from a template.");
        }

        return DB::transaction(function () use ($plan, $fields) {
            $template = $plan->masterTemplate()->firstOrFail();
            $defaults = $template->defaultsAsPlanAttributes();

            $query = TenantPlanOverride::where('plan_id', $plan->id);
            if ($fields !== null) {
                $query->whereIn('field_name', $fields);
            }
            $toReset = $query->pluck('field_name')->all();

            $patch = [];
            foreach ($toReset as $field) {
                if (array_key_exists($field, $defaults)) {
                    $patch[$field] = $defaults[$field];
                }
            }

            if (!empty($patch)) {
                $plan->update($patch);
                $query->delete();
            }

            $hasOverrides = TenantPlanOverride::where('plan_id', $plan->id)->exists();
            $plan->update(['is_synced_with_template' => !$hasOverrides]);

            return $plan->fresh();
        });
    }

    /**
     * Detach a plan from its template. The plan retains its current values
     * but is no longer tracked against the template; future template edits
     * won't propagate. Override records are deleted.
     */
    public function detach(MembershipPlan $plan): MembershipPlan
    {
        return DB::transaction(function () use ($plan) {
            TenantPlanOverride::where('plan_id', $plan->id)->delete();
            $plan->update([
                'master_template_id' => null,
                'template_version_applied' => null,
                'is_synced_with_template' => true,
                'template_last_synced_at' => null,
            ]);
            return $plan->fresh();
        });
    }

    /**
     * Compute a per-field "lock state" map for the given plan. Useful for
     * the practice settings UI so we can disable locked inputs.
     *
     * @return array<string, array{locked: bool, overridden: bool, template_default: mixed, current_value: mixed, monthly_price_min?: float|null, monthly_price_max?: float|null, annual_price_min?: float|null, annual_price_max?: float|null}>
     */
    public function fieldStates(MembershipPlan $plan): array
    {
        if (!$plan->isFromTemplate()) {
            return [];
        }

        $template = $plan->masterTemplate()->firstOrFail();
        $defaults = $template->defaultsAsPlanAttributes();
        $overrideFields = TenantPlanOverride::where('plan_id', $plan->id)
            ->pluck('field_name')
            ->all();

        $out = [];
        foreach (MasterPlanTemplate::LOCKABLE_FIELDS as $field) {
            $entry = [
                'locked' => $template->isFieldLocked($field),
                'overridden' => in_array($field, $overrideFields, true),
                'template_default' => $defaults[$field] ?? null,
                'current_value' => $plan->{$field} ?? null,
            ];
            if ($field === 'monthly_price') {
                $entry['monthly_price_min'] = $template->monthly_price_min !== null
                    ? (float) $template->monthly_price_min : null;
                $entry['monthly_price_max'] = $template->monthly_price_max !== null
                    ? (float) $template->monthly_price_max : null;
            }
            if ($field === 'annual_price') {
                $entry['annual_price_min'] = $template->annual_price_min !== null
                    ? (float) $template->annual_price_min : null;
                $entry['annual_price_max'] = $template->annual_price_max !== null
                    ? (float) $template->annual_price_max : null;
            }
            $out[$field] = $entry;
        }
        return $out;
    }

    private function checkPriceBounds(mixed $value, mixed $min, mixed $max): ?string
    {
        if (!is_numeric($value)) {
            return null;
        }
        $v = (float) $value;
        if ($min !== null && $v < (float) $min) {
            return "Price must be at least \${$min} per the operator template.";
        }
        if ($max !== null && $v > (float) $max) {
            return "Price must be at most \${$max} per the operator template.";
        }
        return null;
    }

    private function valuesEqual(mixed $a, mixed $b): bool
    {
        if (is_numeric($a) && is_numeric($b)) {
            return abs((float) $a - (float) $b) < 0.001;
        }
        return $a == $b;
    }

    private function assertTemplateBelongsToOperator(MasterPlanTemplate $template, Practice $tenant): void
    {
        if ($template->operator_id !== $tenant->operator_id) {
            throw ValidationException::withMessages([
                'master_template_id' => ['This template does not belong to your operator.'],
            ]);
        }
    }
}
