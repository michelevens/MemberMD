<?php

namespace App\Services;

/**
 * RFC 6238 TOTP implementation using HMAC-SHA1.
 * No external dependencies required.
 */
class TOTPService
{
    private const PERIOD = 30;
    private const DIGITS = 6;
    private const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /**
     * Generate a random base32-encoded secret (20 bytes = 160 bits).
     */
    public function generateSecret(int $bytes = 20): string
    {
        $raw = random_bytes($bytes);
        return $this->base32Encode($raw);
    }

    /**
     * Generate a 6-digit TOTP code for the given secret and time.
     */
    public function generateCode(string $secret, ?int $timestamp = null): string
    {
        $timestamp = $timestamp ?? time();
        $counter = intdiv($timestamp, self::PERIOD);

        $key = $this->base32Decode($secret);

        // Pack counter as 8-byte big-endian
        $counterBytes = pack('N*', 0, $counter);

        $hash = hash_hmac('sha1', $counterBytes, $key, true);

        // Dynamic truncation
        $offset = ord($hash[19]) & 0x0F;
        $code = (
            ((ord($hash[$offset]) & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8) |
            (ord($hash[$offset + 3]) & 0xFF)
        ) % (10 ** self::DIGITS);

        return str_pad((string) $code, self::DIGITS, '0', STR_PAD_LEFT);
    }

    /**
     * Verify a TOTP code against the current time window ±1 (90-second tolerance).
     */
    public function verifyCode(string $secret, string $code): bool
    {
        $timestamp = time();

        for ($i = -1; $i <= 1; $i++) {
            $expected = $this->generateCode($secret, $timestamp + ($i * self::PERIOD));
            if (hash_equals($expected, $code)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Generate an otpauth:// URI for QR code generation.
     */
    public function getOtpauthUrl(string $secret, string $email): string
    {
        $issuer = 'MemberMD';
        $label = rawurlencode("{$issuer} ({$email})");
        $params = http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => self::DIGITS,
            'period' => self::PERIOD,
        ]);

        return "otpauth://totp/{$label}?{$params}";
    }

    /**
     * Encode raw bytes to base32.
     */
    private function base32Encode(string $data): string
    {
        $binary = '';
        foreach (str_split($data) as $char) {
            $binary .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }

        $result = '';
        $chunks = str_split($binary, 5);
        foreach ($chunks as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $result .= self::BASE32_ALPHABET[bindec($chunk)];
        }

        return $result;
    }

    /**
     * Decode a base32-encoded string to raw bytes.
     */
    private function base32Decode(string $encoded): string
    {
        $encoded = strtoupper(rtrim($encoded, '='));
        $binary = '';

        foreach (str_split($encoded) as $char) {
            $index = strpos(self::BASE32_ALPHABET, $char);
            if ($index === false) {
                continue;
            }
            $binary .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }

        $result = '';
        $chunks = str_split($binary, 8);
        foreach ($chunks as $chunk) {
            if (strlen($chunk) < 8) {
                break;
            }
            $result .= chr(bindec($chunk));
        }

        return $result;
    }
}
