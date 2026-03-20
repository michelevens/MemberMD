<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class SpecialistDirectory extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $table = 'specialist_directory';

    protected $fillable = [
        'tenant_id',
        'name',
        'specialty',
        'phone',
        'fax',
        'email',
        'address',
        'notes',
        'is_preferred',
    ];

    protected $casts = [
        'is_preferred' => 'boolean',
    ];

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class, 'tenant_id');
    }
}
