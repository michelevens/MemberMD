<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Employer extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'name', 'legal_name',
        'contact_name', 'contact_email', 'contact_phone',
        'address', 'city', 'state', 'zip',
        'employee_count_cap', 'status', 'notes',
    ];

    protected $casts = [
        'employee_count_cap' => 'integer',
    ];

    public function contracts(): HasMany { return $this->hasMany(EmployerContract::class); }
    public function invoices(): HasMany { return $this->hasMany(EmployerInvoice::class); }
    public function employees(): HasMany { return $this->hasMany(Patient::class, 'employer_id'); }
}
