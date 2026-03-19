<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PracticeSetting extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['practice_id', 'key', 'value'];

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class);
    }
}
