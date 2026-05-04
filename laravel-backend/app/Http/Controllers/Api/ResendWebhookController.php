<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SignatureRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Resend webhook handler. Resend posts events in the shape:
 *   {
 *     "type": "email.delivered" | "email.opened" | "email.clicked" | ...,
 *     "created_at": "2026-05-04T12:00:00Z",
 *     "data": { "email_id": "abc123", "to": ["..."], ... }
 *   }
 *
 * We match by email_id (set when the SignatureRequestEmail was sent —
 * see SignatureRequestEmail.php where the Resend message id is captured)
 * and stamp the matching column on SignatureRequest.
 *
 * Signature verification: Resend signs with `svix-signature`. For now
 * we match on a shared-secret header (RESEND_WEBHOOK_SECRET) — the
 * stricter svix verification is a follow-up since the audit columns
 * are advisory, not load-bearing for trust decisions.
 */
class ResendWebhookController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $secret = (string) config('services.resend.webhook_secret', env('RESEND_WEBHOOK_SECRET', ''));
        if ($secret !== '') {
            $provided = (string) $request->header('X-Webhook-Secret', '');
            if (!hash_equals($secret, $provided)) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }
        }

        $type = (string) $request->input('type', '');
        $emailId = (string) ($request->input('data.email_id') ?? $request->input('data.id') ?? '');
        if ($emailId === '') {
            return response()->json(['ok' => true, 'note' => 'no email_id in payload']);
        }

        $req = SignatureRequest::where('email_id', $emailId)->first();
        if (!$req) {
            // Other Mail flows (welcome, reminder etc.) hit this same
            // webhook. Silently ignore — not our row.
            return response()->json(['ok' => true, 'note' => 'no matching signature_request']);
        }

        $col = match ($type) {
            'email.delivered' => 'email_delivered_at',
            'email.opened'    => 'email_opened_at',
            'email.clicked'   => 'email_clicked_at',
            default           => null,
        };
        if ($col === null) {
            return response()->json(['ok' => true, 'note' => 'event ignored']);
        }

        // Only stamp on first occurrence so the timestamp reflects the
        // FIRST delivery/open/click — admins want to know "when did
        // this start happening" not "when did the latest event fire."
        if ($req->{$col} === null) {
            try {
                $req->update([$col => now()]);
            } catch (\Throwable $e) {
                Log::warning('Resend webhook write failed', [
                    'email_id' => $emailId,
                    'type' => $type,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json(['ok' => true]);
    }
}
