<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Append-only row per transactional email send. Body is NEVER stored —
 * recipient + mailable name + status + error message are sufficient
 * for the deliverability dashboard and never carry PHI.
 */
class MailDispatchLog extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'tenant_id', 'recipient', 'mailable', 'context',
        'status', 'error_message',
    ];

    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';
}
