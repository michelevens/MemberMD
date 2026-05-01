<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
    <meta charset="utf-8">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>@yield('title', 'MemberMD')</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office">
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        /* Reset */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }

        /* Typography */
        body, td, p, a, li, blockquote {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        /* Responsive */
        @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; }
            .email-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .stack-column { display: block !important; width: 100% !important; }
        }

        /* Button hover */
        .btn-primary:hover { filter: brightness(0.92); }
        .btn-outline:hover { background-color: #f0faf6 !important; }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; -webkit-font-smoothing: antialiased;">
    <!-- Preheader (hidden preview text) -->
    @hasSection('preheader')
    <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #f4f5f7;">
        @yield('preheader')
    </div>
    @endif

    <!-- Full-width wrapper -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f5f7;">
        <tr>
            <td align="center" style="padding: 24px 12px;">

                <!-- Email container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%;">

                    <!-- HEADER — flat Stripe-grade: white bg, brand sigil + wordmark, eyebrow subtitle -->
                    <tr>
                        <td style="background-color: #ffffff; border-radius: 12px 12px 0 0; padding: 28px 40px 20px; text-align: left; border-bottom: 1px solid #f1f5f9;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td valign="middle" style="vertical-align: middle;">
                                        @if(!empty($logoUrl))
                                            <img src="{{ $logoUrl }}" alt="{{ $practiceName ?? 'MemberMD' }}" style="max-height: 36px; max-width: 200px; display: block;">
                                        @else
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                                <tr>
                                                    <td style="background-color: {{ $accentColor ?? '#635bff' }}; width: 28px; height: 28px; border-radius: 6px; text-align: center; vertical-align: middle; padding: 0;">
                                                        <span style="font-size: 14px; font-weight: 600; color: #ffffff; line-height: 28px;">{{ strtoupper(substr($practiceName ?? 'M', 0, 1)) }}</span>
                                                    </td>
                                                    <td style="padding-left: 10px; vertical-align: middle;">
                                                        <span style="font-size: 17px; font-weight: 600; color: #0f172a; letter-spacing: -0.2px;">
                                                            {{ $practiceName ?? 'MemberMD' }}
                                                        </span>
                                                    </td>
                                                </tr>
                                            </table>
                                        @endif
                                    </td>
                                    @hasSection('header_subtitle')
                                    <td align="right" valign="middle" style="vertical-align: middle;">
                                        <span style="font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase;">
                                            @yield('header_subtitle')
                                        </span>
                                    </td>
                                    @endif
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- BODY -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 40px 40px 32px;" class="email-padding">
                            @yield('content')
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 12px 12px; padding: 28px 40px;" class="email-padding">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                @if(!empty($practiceName))
                                <tr>
                                    <td align="center" style="padding-bottom: 12px;">
                                        <span style="font-size: 14px; font-weight: 600; color: #374151;">{{ $practiceName }}</span>
                                        @if(!empty($practiceEmail))
                                            <br>
                                            <a href="mailto:{{ $practiceEmail }}" style="font-size: 13px; color: #635bff; text-decoration: none;">{{ $practiceEmail }}</a>
                                        @endif
                                        @if(!empty($practicePhone))
                                            <span style="font-size: 13px; color: #6b7280;"> &middot; {{ $practicePhone }}</span>
                                        @endif
                                    </td>
                                </tr>
                                @endif
                                <tr>
                                    <td align="center" style="padding-bottom: 8px;">
                                        <span style="font-size: 12px; color: #9ca3af;">
                                            Powered by <strong style="color: #6b7280;">MemberMD</strong> &mdash; Direct Primary Care, simplified.
                                        </span>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <span style="font-size: 11px; color: #9ca3af;">
                                            @hasSection('footer_extra')
                                                @yield('footer_extra')
                                            @else
                                                <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}" style="color: #9ca3af; text-decoration: underline;">Manage Preferences</a>
                                                &nbsp;&middot;&nbsp;
                                                <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/unsubscribe" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>
                                            @endif
                                        </span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>
                <!-- /Email container -->

            </td>
        </tr>
    </table>
</body>
</html>
