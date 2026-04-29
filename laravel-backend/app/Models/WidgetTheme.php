<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Per-tenant CSS theme configuration applied to embeddable widgets.
 *
 * Two layers:
 *   - css_variables: a flat key → string map applied as :root CSS custom
 *     properties on the widget shell. Safe by construction.
 *   - custom_css: optional escape hatch for arbitrary CSS, sanitized via
 *     a strict allowlist (no @import, no url() to off-host, no expression()).
 */
class WidgetTheme extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    public const SCOPE_ALL = 'all';
    public const SCOPE_ENROLLMENT = 'enrollment';
    public const SCOPE_PLANS = 'plans';
    public const SCOPE_BOOKING = 'booking';

    public const SCOPES = [self::SCOPE_ALL, self::SCOPE_ENROLLMENT, self::SCOPE_PLANS, self::SCOPE_BOOKING];

    /**
     * Variable names the API accepts. Anything outside this list is rejected
     * to keep the surface small + safe.
     */
    public const ALLOWED_VARIABLES = [
        'primary',          // brand primary
        'primary_hover',
        'secondary',
        'accent',
        'text',
        'text_muted',
        'background',
        'surface',
        'border',
        'success',
        'warning',
        'error',
        'radius_sm',        // border radii
        'radius_md',
        'radius_lg',
        'spacing_unit',
    ];

    protected $fillable = [
        'tenant_id', 'scope', 'css_variables', 'custom_css',
        'font_family', 'logo', 'settings', 'is_active',
    ];

    protected $casts = [
        'css_variables' => 'array',
        'logo' => 'array',
        'settings' => 'array',
        'is_active' => 'boolean',
    ];

    /**
     * Default theme — used when a tenant has no widget_themes row.
     */
    public static function defaults(): array
    {
        return [
            'primary' => '#27ab83',
            'primary_hover' => '#147d64',
            'secondary' => '#334e68',
            'accent' => '#27ab83',
            'text' => '#102a43',
            'text_muted' => '#64748b',
            'background' => '#ffffff',
            'surface' => '#f8fafc',
            'border' => '#e2e8f0',
            'success' => '#22c55e',
            'warning' => '#f59e0b',
            'error' => '#ef4444',
            'radius_sm' => '6px',
            'radius_md' => '12px',
            'radius_lg' => '20px',
            'spacing_unit' => '4px',
        ];
    }

    /**
     * Resolve effective theme by merging defaults + saved variables.
     */
    public function resolvedVariables(): array
    {
        return array_merge(self::defaults(), $this->css_variables ?? []);
    }
}
