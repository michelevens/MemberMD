<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Document extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'name', 'original_name', 'type', 'category',
        'description', 'file_path', 'file_url', 'mime_type', 'size',
        'documentable_type', 'documentable_id',
        'patient_id', 'uploaded_by', 'status',
    ];

    protected $casts = [
        'size' => 'integer',
    ];

    public function documentable(): MorphTo { return $this->morphTo(); }
    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function uploader(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by'); }
}
