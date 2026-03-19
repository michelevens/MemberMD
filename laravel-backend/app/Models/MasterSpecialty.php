<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MasterSpecialty extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'name', 'code', 'description', 'icon',
        'default_appointment_types', 'default_screening_tools',
        'default_diagnosis_favorites', 'default_medication_categories',
        'default_lab_panels', 'default_plan_templates',
        'default_intake_sections', 'default_addons',
        'is_active',
    ];

    protected $casts = [
        'default_appointment_types' => 'array',
        'default_screening_tools' => 'array',
        'default_diagnosis_favorites' => 'array',
        'default_medication_categories' => 'array',
        'default_lab_panels' => 'array',
        'default_plan_templates' => 'array',
        'default_intake_sections' => 'array',
        'default_addons' => 'array',
        'is_active' => 'boolean',
    ];
}
