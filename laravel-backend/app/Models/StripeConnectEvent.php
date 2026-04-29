<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StripeConnectEvent extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'stripe_event_id',
        'event_type',
        'stripe_account_id',
        'practice_id',
        'payload',
        'processing_status',
        'error_message',
        'processed_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'processed_at' => 'datetime',
    ];

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class);
    }
}
