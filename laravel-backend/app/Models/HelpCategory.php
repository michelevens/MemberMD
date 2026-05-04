<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HelpCategory extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['name', 'slug', 'icon', 'description', 'sort_order'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function articles(): HasMany
    {
        return $this->hasMany(HelpArticle::class);
    }
}
