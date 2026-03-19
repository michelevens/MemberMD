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
    'allowed_headers' => ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
