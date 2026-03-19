<?php

namespace App\Http\Middleware;

use App\Models\PhiAccessLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PHIAccessLogger
{
    /**
     * Routes that access patient data and should be logged.
     */
    private array $patientRoutes = [
        'patients.show', 'patients.update',
        'patients.memberships', 'patients.appointments',
        'patients.encounters', 'patients.prescriptions',
        'patients.screenings', 'patients.documents',
    ];

    /**
     * Handle an incoming request — log PHI access non-blocking.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Only log successful responses
        if ($response->getStatusCode() >= 400) {
            return $response;
        }

        try {
            $this->logAccess($request);
        } catch (\Throwable $e) {
            // Never break app flow for logging
            \Log::warning('PHI access logging failed: ' . $e->getMessage());
        }

        return $response;
    }

    private function logAccess(Request $request): void
    {
        $user = $request->user();
        if (!$user) {
            return;
        }

        // Extract patient_id from route parameters
        $patientId = $request->route('patient')
            ?? $request->route('id')
            ?? $request->input('patient_id');

        if (!$patientId) {
            return;
        }

        // Determine resource type and access type from the route
        $routeName = $request->route()?->getName() ?? '';
        $method = $request->method();

        $accessType = match ($method) {
            'GET' => 'view',
            'POST' => 'create',
            'PUT', 'PATCH' => 'update',
            'DELETE' => 'delete',
            default => 'access',
        };

        // Determine resource type from route
        $resourceType = 'patient';
        if (str_contains($routeName, 'encounter')) $resourceType = 'encounter';
        elseif (str_contains($routeName, 'prescription')) $resourceType = 'prescription';
        elseif (str_contains($routeName, 'screening')) $resourceType = 'screening';
        elseif (str_contains($routeName, 'document')) $resourceType = 'document';
        elseif (str_contains($routeName, 'membership')) $resourceType = 'membership';
        elseif (str_contains($routeName, 'appointment')) $resourceType = 'appointment';

        PhiAccessLog::create([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
            'patient_id' => $patientId,
            'resource_type' => $resourceType,
            'resource_id' => $request->route('id') ?? $request->route('patient'),
            'access_type' => $accessType,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'session_id' => session()->getId(),
        ]);
    }
}
