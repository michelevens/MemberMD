<?php

namespace App\Services;

use App\Models\PhiCommunicationConsent;
use App\Models\TenantNotificationPreference;

/**
 * Central declaration of every transactional notification the system
 * may send. Drives the practice's Notifications settings UI AND the
 * MailDispatcher gate that filters disabled / PHI-without-consent
 * sends at runtime.
 *
 * Adding a new notification:
 *   1. Add an entry to KEYS below (key + audience + label + description
 *      + default_enabled + is_phi_bearing).
 *   2. Make sure the call site that fires the email passes the matching
 *      key as MailDispatcher::send($to, $mailable, NotificationRegistry::KEY)
 *      — the dispatcher does the rest.
 *
 * Removing a notification:
 *   1. Remove the entry from KEYS. Stale rows in tenant_notification_
 *      preferences will simply never be consulted again; no migration
 *      needed.
 *
 * Audiences:
 *   - patient        : sent to patients
 *   - membership     : sent to patients re: their membership lifecycle
 *   - practice       : sent to practice staff/admins
 *   - employer       : sent to employers (sponsor accounts)
 *   - operator       : sent to operator owners/admins
 *
 * is_phi_bearing:
 *   true  = email may contain patient name, visit type, billing detail.
 *           Will be SUPPRESSED when the patient hasn't granted a
 *           PhiCommunicationConsent.
 *   false = generic transactional (password reset, system alerts).
 *           Always sent regardless of consent.
 */
class NotificationRegistry
{
    /** @var array<string, array<string, mixed>> */
    public const KEYS = [
        // ─── Patient ────────────────────────────────────────────────────
        'patient.appointment_confirmation' => [
            'audience' => 'patient',
            'label' => 'Appointment Confirmation',
            'description' => 'Sent immediately when a patient books or a practice confirms an appointment.',
            'default_enabled' => true,
            'is_phi_bearing' => true,
        ],
        'patient.appointment_reminder' => [
            'audience' => 'patient',
            'label' => 'Appointment Reminder',
            'description' => 'Sent the day before an appointment as a reminder.',
            'default_enabled' => true,
            'is_phi_bearing' => true,
        ],
        'patient.welcome' => [
            'audience' => 'patient',
            'label' => 'Welcome to the Practice',
            'description' => 'Sent on first enrollment confirmation.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'patient.password_reset' => [
            'audience' => 'patient',
            'label' => 'Password Reset',
            'description' => 'Sent when a patient requests a password reset link.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'patient.birthday' => [
            'audience' => 'patient',
            'label' => 'Birthday Greeting',
            'description' => 'Sent on the patient\'s birthday as a soft engagement touch.',
            'default_enabled' => false,
            'is_phi_bearing' => false,
        ],
        'patient.card_expiring_soon' => [
            'audience' => 'patient',
            'label' => 'Card Expiring Soon',
            'description' => 'Sent when the patient\'s card on file is expiring within 30 days. Direct churn protection.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'patient.charge_failed' => [
            'audience' => 'patient',
            'label' => 'Charge Failed',
            'description' => 'Sent to the patient when a recurring charge fails.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'patient.refund_successful' => [
            'audience' => 'patient',
            'label' => 'Refund Successful',
            'description' => 'Sent to the patient after a successful refund posts.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'patient.signature_request' => [
            'audience' => 'patient',
            'label' => 'Signature Request',
            'description' => 'Sent when the practice asks the patient to sign a consent or document.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'patient.ad_hoc_charge' => [
            'audience' => 'patient',
            'label' => 'One-Time Charge Request',
            'description' => 'Sent when the practice issues an ad-hoc charge (form fee, after-hours visit).',
            'default_enabled' => true,
            'is_phi_bearing' => true,
        ],

        // ─── Membership lifecycle ───────────────────────────────────────
        'membership.activated' => [
            'audience' => 'membership',
            'label' => 'Membership Activated',
            'description' => 'Sent when a patient\'s membership goes active (post-payment).',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'membership.cancelled' => [
            'audience' => 'membership',
            'label' => 'Membership Cancelled',
            'description' => 'Sent to the patient when their membership is cancelled.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'membership.dependent_added' => [
            'audience' => 'membership',
            'label' => 'Family Member Added',
            'description' => 'Sent when a dependent is added to a family membership.',
            'default_enabled' => true,
            'is_phi_bearing' => true,
        ],

        // ─── Practice staff/admin ───────────────────────────────────────
        'practice.new_member_enrolled' => [
            'audience' => 'practice',
            'label' => 'New Member Enrolled',
            'description' => 'Notifies practice admins when a new member completes enrollment.',
            'default_enabled' => true,
            'is_phi_bearing' => true,
        ],
        'practice.member_cancelled' => [
            'audience' => 'practice',
            'label' => 'Member Cancelled',
            'description' => 'Notifies practice admins when a member self-cancels their membership.',
            'default_enabled' => true,
            'is_phi_bearing' => true,
        ],
        'practice.charge_failed' => [
            'audience' => 'practice',
            'label' => 'Charge Failed (Practice Notice)',
            'description' => 'Notifies practice admins when a member\'s recurring charge fails — direct revenue protection.',
            'default_enabled' => true,
            'is_phi_bearing' => true,
        ],
        'practice.application_received' => [
            'audience' => 'practice',
            'label' => 'New Practice Application Received',
            'description' => 'Sent to superadmin when a new practice signs up and is pending approval.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
        'practice.approved' => [
            'audience' => 'practice',
            'label' => 'Practice Approved',
            'description' => 'Sent to a practice admin when their application is approved by superadmin.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],

        // ─── Platform billing (Practice → Superadmin) ──────────────────
        'platform_billing.payment_failed' => [
            'audience' => 'practice',
            'label' => 'Platform Billing — Payment Failed',
            'description' => 'Sent when the practice\'s platform subscription payment fails.',
            'default_enabled' => true,
            'is_phi_bearing' => false,
        ],
    ];

    /**
     * Get the registry definition for one key. Returns null if the key
     * isn't registered (e.g., legacy call site that hasn't been migrated).
     */
    public static function get(string $key): ?array
    {
        return self::KEYS[$key] ?? null;
    }

    /**
     * List all registered keys, optionally filtered by audience.
     *
     * @param  string|null  $audience  patient | membership | practice | employer | operator
     * @return array<string, array<string, mixed>>
     */
    public static function all(?string $audience = null): array
    {
        if ($audience === null) {
            return self::KEYS;
        }
        return array_filter(self::KEYS, fn ($d) => $d['audience'] === $audience);
    }

    /**
     * Decide whether a notification should fire for a given tenant +
     * (optionally) patient. Returns ['allow' => bool, 'reason' => ?string].
     *
     * Order of checks:
     *   1. Key registered? Unknown keys default to allow (legacy call
     *      sites unaware of registry shouldn't be silently dropped).
     *   2. Tenant-level disabled? Block.
     *   3. PHI-bearing AND patient hasn't granted consent? Block.
     *   4. Otherwise allow.
     */
    public static function shouldSend(?string $key, ?string $tenantId, ?string $patientId = null): array
    {
        if ($key === null) {
            return ['allow' => true, 'reason' => null];
        }

        $def = self::get($key);
        if ($def === null) {
            return ['allow' => true, 'reason' => null];
        }

        if ($tenantId) {
            $pref = TenantNotificationPreference::where('tenant_id', $tenantId)
                ->where('notification_key', $key)
                ->first();
            if ($pref && !$pref->enabled) {
                return ['allow' => false, 'reason' => 'tenant_disabled'];
            }
        }

        if (!empty($def['is_phi_bearing']) && $tenantId && $patientId) {
            $consent = PhiCommunicationConsent::where('tenant_id', $tenantId)
                ->where('patient_id', $patientId)
                ->whereNotNull('granted_at')
                ->whereNull('revoked_at')
                ->first();
            if (!$consent) {
                return ['allow' => false, 'reason' => 'phi_consent_missing'];
            }
        }

        return ['allow' => true, 'reason' => null];
    }
}
