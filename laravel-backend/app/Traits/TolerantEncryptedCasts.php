<?php

namespace App\Traits;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Log;

/**
 * Catch DecryptException when reading an `encrypted` / `encrypted:array`
 * cast attribute, so a single corrupted row can't 500 a whole list
 * endpoint.
 *
 * The encryption migration is idempotent and only encrypts rows whose
 * values don't already look like Laravel ciphertext (start with "eyJ").
 * Edge case: a row written before the migration ran with a value that
 * COINCIDENTALLY started with "eyJ" + matched the length heuristic
 * would be treated as ciphertext on read and DecryptException out.
 * Same outcome if a future schema-drift writes plaintext to an
 * encrypted column. Either way, one bad row shouldn't take down the
 * whole list — return null + log the row id instead.
 *
 * Apply to any model with `encrypted` / `encrypted:array` casts.
 */
trait TolerantEncryptedCasts
{
    protected function castAttribute($key, $value)
    {
        try {
            return parent::castAttribute($key, $value);
        } catch (DecryptException $e) {
            // Log once per row+column so ops can find and re-encrypt
            // the bad row, but DON'T propagate the exception.
            Log::warning('Encrypted column decrypt failed — returning null', [
                'model' => static::class,
                'id' => $this->getKey(),
                'attribute' => $key,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }
}
