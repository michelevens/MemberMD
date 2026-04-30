<?php

return [
    'paths' => ['api/*'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => array_filter([
        'https://app.membermd.io',
        'https://membermd.io',
        env('APP_ENV') !== 'production' ? 'http://localhost:5173' : null,
        env('APP_ENV') !== 'production' ? 'http://localhost:3000' : null,
    ]),
    'allowed_origins_patterns' => [],
    // The two custom headers (X-Operator-Id, X-Active-Tenant-Id) are read by
    // App\Http\Middleware\ResolveOperatorScope to figure out which tenant
    // a superadmin / operator is currently scoped to. The frontend's
    // apiFetch wrapper attaches them when set in sessionStorage. They MUST
    // appear in allowed_headers or browser preflight rejects every request
    // with "Failed to fetch" (silent client-side error, no server log).
    'allowed_headers' => [
        'Content-Type',
        'Authorization',
        'Accept',
        'X-Requested-With',
        'X-Operator-Id',
        'X-Active-Tenant-Id',
        'Idempotency-Key',
    ],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
