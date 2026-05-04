<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class HelpArticle extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'help_category_id', 'title', 'slug', 'content_markdown', 'excerpt',
        'view_count', 'helpful_count', 'not_helpful_count',
        'tags', 'is_published', 'sort_order',
    ];

    protected $casts = [
        'tags' => 'array',
        'is_published' => 'boolean',
        'view_count' => 'integer',
        'helpful_count' => 'integer',
        'not_helpful_count' => 'integer',
        'sort_order' => 'integer',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(HelpCategory::class, 'help_category_id');
    }

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (HelpArticle $a) {
            if (empty($a->slug) && !empty($a->title)) {
                $a->slug = Str::slug($a->title);
            }
            if (empty($a->excerpt) && !empty($a->content_markdown)) {
                $a->excerpt = Str::limit(strip_tags($a->content_markdown), 200);
            }
        });
    }
}
