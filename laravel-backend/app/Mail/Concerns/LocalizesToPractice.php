<?php

namespace App\Mail\Concerns;

use App\Models\Practice;

/**
 * Helper for platform-billing Mailables that need to render in the recipient
 * practice's preferred language. Resolves locale from Practice.locale,
 * defaulting to 'en'. Supported: en, es.
 */
trait LocalizesToPractice
{
    protected function resolveLocale(?Practice $practice): string
    {
        $locale = $practice?->locale ?? 'en';
        return in_array($locale, ['en', 'es'], true) ? $locale : 'en';
    }

    /**
     * Pick the localized blade view for a base view name. Suffix non-default
     * locales with `.{locale}` (so `emails.x.trial-expired` becomes
     * `emails.x.trial-expired.es` when locale=es), falling back to the base
     * view when the localized one doesn't exist.
     */
    protected function localizedView(string $baseView, string $locale): string
    {
        if ($locale === 'en') return $baseView;
        $candidate = "{$baseView}-{$locale}";
        return view()->exists($candidate) ? $candidate : $baseView;
    }

    protected function localizedSubject(string $key, string $locale, array $vars = []): string
    {
        $strings = self::SUBJECT_STRINGS[$key][$locale]
            ?? self::SUBJECT_STRINGS[$key]['en']
            ?? $key;
        // Simple {{ var }} interpolation — keeps us off Laravel's full
        // translation machinery for the four billing emails.
        foreach ($vars as $name => $value) {
            $strings = str_replace('{{ ' . $name . ' }}', (string) $value, $strings);
        }
        return $strings;
    }
}
