<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'daily' => [
        'api_key' => env('DAILY_API_KEY', ''),
        'domain' => env('DAILY_DOMAIN', 'membermd'),
    ],

    'srfax' => [
        'access_id' => env('SRFAX_ACCESS_ID'),
        'access_pwd' => env('SRFAX_ACCESS_PWD'),
        'caller_id' => env('SRFAX_CALLER_ID', '0000000000'),
        'sender_email' => env('SRFAX_SENDER_EMAIL', 'noreply@membermd.io'),
    ],

    'twilio' => [
        // Account SID + Auth Token from twilio.com/console.
        // Auth Token is also used to verify inbound webhook signatures.
        'account_sid' => env('TWILIO_ACCOUNT_SID'),
        'auth_token' => env('TWILIO_AUTH_TOKEN'),
        'from' => env('TWILIO_FROM_NUMBER'),
    ],

    'stripe' => [
        'key' => env('STRIPE_KEY'),
        'secret' => env('STRIPE_SECRET'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
        'connect_webhook_secret' => env('STRIPE_CONNECT_WEBHOOK_SECRET'),
        'connect_return_url' => env('STRIPE_CONNECT_RETURN_URL', env('APP_URL') . '/#/practice/settings/payments?status=return'),
        'connect_refresh_url' => env('STRIPE_CONNECT_REFRESH_URL', env('APP_URL') . '/#/practice/settings/payments?status=refresh'),
    ],

    // VAPID keys for Web Push. Generated via:
    //   ./vendor/bin/web-push generate
    // Public key is sent to the browser; private key signs payloads server-side.
    // Subject must be a mailto: or https: URL identifying the application owner.
    'webpush' => [
        'subject' => env('VAPID_SUBJECT', 'mailto:noreply@membermd.io'),
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
    ],

];
