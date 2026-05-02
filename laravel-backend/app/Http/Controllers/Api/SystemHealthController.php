<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MailDispatchLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Platform-wide health checks for the SuperAdmin dashboard. Distinct
 * from per-tenant health endpoints (which live on PracticeController):
 * these answer "is MemberMD itself configured correctly?" rather than
 * "is tenant X's webhook delivering?".
 */
class SystemHealthController extends Controller
{
    /**
     * Mail driver health. Surfaces:
     *   - configured driver name (smtp / log / resend / etc.)
     *   - whether the env vars the driver expects are present
     *   - last-7d send / failure counts across all tenants
     *   - a status string the UI can color (ok / warning / not_configured)
     *
     * Use case: "did Jerry's payment-link email actually go out?" — the
     * SuperAdmin can glance at this card to see whether MAIL is even
     * wired up before chasing per-tenant deliverability logs.
     */
    public function mailHealth(Request $request): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $driver = (string) config('mail.default', 'log');
        $fromAddress = (string) config('mail.from.address', '');
        $fromName = (string) config('mail.from.name', '');

        // Per-driver "is the credential present?" check. We never return
        // the secret itself — only whether it's truthy. Treat 'log' as
        // intentionally non-production: it doesn't need credentials.
        $configured = false;
        $missingVars = [];
        switch ($driver) {
            case 'smtp':
                $host = config('mail.mailers.smtp.host');
                $username = config('mail.mailers.smtp.username');
                $password = config('mail.mailers.smtp.password');
                if (empty($host)) $missingVars[] = 'MAIL_HOST';
                if (empty($username)) $missingVars[] = 'MAIL_USERNAME';
                if (empty($password)) $missingVars[] = 'MAIL_PASSWORD';
                $configured = empty($missingVars);
                break;
            case 'resend':
                if (empty(config('services.resend.key'))) {
                    $missingVars[] = 'RESEND_API_KEY';
                }
                $configured = empty($missingVars);
                break;
            case 'log':
            case 'array':
            case 'failover':
                // Dev/test drivers — "configured" means the from-address
                // is set since that's all they need.
                $configured = !empty($fromAddress);
                break;
            default:
                // Unknown driver — assume configured if from-address present.
                $configured = !empty($fromAddress);
        }

        if (empty($fromAddress) || $fromAddress === 'hello@example.com') {
            $missingVars[] = 'MAIL_FROM_ADDRESS';
            $configured = false;
        }

        $since = now()->subDays(7);
        $sent = MailDispatchLog::where('status', MailDispatchLog::STATUS_SENT)
            ->where('created_at', '>=', $since)
            ->count();
        $failed = MailDispatchLog::where('status', MailDispatchLog::STATUS_FAILED)
            ->where('created_at', '>=', $since)
            ->count();
        $total = $sent + $failed;
        $successRate = $total > 0 ? round(($sent / $total) * 100, 1) : null;

        // Status: 'not_configured' is the loudest — the SuperAdmin should
        // see this and know mail will silently fail. 'warning' = configured
        // but recent failures > 10% (or driver=log in production). 'ok' =
        // either no failures or a non-production driver intentionally.
        $appEnv = (string) config('app.env', 'production');
        $status = 'ok';
        if (!$configured) {
            $status = 'not_configured';
        } elseif ($appEnv === 'production' && in_array($driver, ['log', 'array'], true)) {
            $status = 'warning';
        } elseif ($successRate !== null && $successRate < 90.0 && $total >= 5) {
            $status = 'warning';
        }

        return response()->json([
            'data' => [
                'status' => $status,
                'driver' => $driver,
                'configured' => $configured,
                'app_env' => $appEnv,
                'from_address' => $fromAddress,
                'from_name' => $fromName,
                'missing_env_vars' => array_values(array_unique($missingVars)),
                'sent_last_7d' => $sent,
                'failed_last_7d' => $failed,
                'success_rate' => $successRate,
            ],
        ]);
    }
}
