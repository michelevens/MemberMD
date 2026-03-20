<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PharmacyDirectory extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'pharmacy_directory';

    protected $fillable = [
        'ncpdp_id', 'npi', 'name',
        'address', 'city', 'state', 'zip',
        'phone', 'fax',
        'is_24_hour', 'accepts_eprescribe',
        'chain',
    ];

    protected $casts = [
        'is_24_hour' => 'boolean',
        'accepts_eprescribe' => 'boolean',
    ];
}
