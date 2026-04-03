<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class PatientEngagementScore extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'patient_id',
        'overall_score',
        'visit_frequency_score',
        'message_responsiveness_score',
        'screening_completion_score',
        'portal_login_score',
        'no_show_rate_score',
        'last_visit_days_ago',
        'appointments_this_month',
        'messages_response_time_hours',
        'no_show_count_6m',
        'risk_level',
        'engagement_flags',
        'last_calculated_at',
    ];

    protected $casts = [
        'engagement_flags' => 'array',
        'last_calculated_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function isAtRisk(): bool
    {
        return in_array($this->risk_level, ['high', 'at_risk']);
    }

    public function getEngagementBadge(): string
    {
        return match ($this->risk_level) {
            'low' => 'Highly Engaged',
            'normal' => 'Engaged',
            'high' => 'At Risk',
            'at_risk' => 'Critical Risk',
            default => 'Unknown',
        };
    }
}
