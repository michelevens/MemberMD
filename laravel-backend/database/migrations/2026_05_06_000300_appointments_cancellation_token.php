<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cancellation token + refund tracking on appointments.
 *
 *   cancellation_token        Random URL-safe token written into the
 *                             AppointmentConfirmation email link so
 *                             unauthenticated visitors (cash-pay
 *                             bookings) can cancel without an account.
 *                             Same security model as SignatureRequest
 *                             tokens — one-shot, table-lookup, no JWT.
 *   stripe_payment_intent_id  Linked PI from the cash-pay Checkout
 *                             flow. Populated by the webhook when
 *                             converting PendingBooking → Appointment.
 *                             Used to issue refunds on cancel.
 *   amount_paid_cents         Snapshot of what the visitor paid (for
 *                             cash-pay only). Refund math derives
 *                             from this — practice can charge a
 *                             cancellation fee that's a % or fixed
 *                             amount, then we refund (paid - fee).
 *   amount_refunded_cents     Cumulative refunded amount on this
 *                             appointment. Defaults to 0; a partial
 *                             refund updates this and leaves room
 *                             for a follow-up refund if needed.
 *   cancelled_by              "patient" | "practice" — drives the
 *                             refund policy decision tree (practice
 *                             cancels = always full refund; patient
 *                             cancels respects the deadline policy).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            if (!Schema::hasColumn('appointments', 'cancellation_token')) {
                $table->string('cancellation_token', 64)->nullable()->unique()->after('cancel_reason');
            }
            if (!Schema::hasColumn('appointments', 'stripe_payment_intent_id')) {
                $table->string('stripe_payment_intent_id')->nullable()->after('cancellation_token');
            }
            if (!Schema::hasColumn('appointments', 'amount_paid_cents')) {
                $table->integer('amount_paid_cents')->nullable()->after('stripe_payment_intent_id');
            }
            if (!Schema::hasColumn('appointments', 'amount_refunded_cents')) {
                $table->integer('amount_refunded_cents')->default(0)->after('amount_paid_cents');
            }
            if (!Schema::hasColumn('appointments', 'cancelled_by')) {
                $table->string('cancelled_by', 16)->nullable()->after('amount_refunded_cents');
            }
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $cols = [
                'cancellation_token',
                'stripe_payment_intent_id',
                'amount_paid_cents',
                'amount_refunded_cents',
                'cancelled_by',
            ];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('appointments', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
