@extends('emails.layout')

@section('header_subtitle', 'Prueba terminando')

@section('preheader')
Tu prueba de MemberMD termina en {{ $daysLeft }} {{ $daysLeft === 1 ? 'día' : 'días' }}. Elige un plan para seguir.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Tu prueba termina en {{ $daysLeft }} {{ $daysLeft === 1 ? 'día' : 'días' }}
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hola desde MemberMD &mdash; te avisamos que la prueba gratuita de {{ $practiceName }} termina
    @if($trialEndsAt)
        el <strong>{{ \Carbon\Carbon::parse($trialEndsAt)->locale('es')->isoFormat('LL') }}</strong>.
    @else
        pronto.
    @endif
    Elige un plan en la configuración de tu práctica antes de esa fecha para seguir inscribiendo pacientes sin interrupción.
</p>

@if($plan)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #b8e6d2;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #047857; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Plan actual</p>
            <p style="margin: 0; font-size: 18px; color: #064e3b; font-weight: 700;">{{ $plan->name }} (prueba)</p>
            @if($plan->monthly_price > 0)
                <p style="margin: 4px 0 0; font-size: 13px; color: #065f46;">
                    ${{ number_format((float) $plan->monthly_price, 0) }}/mes después de la prueba
                </p>
            @endif
        </td>
    </tr>
</table>
@endif

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/practice/settings?tab=subscription"
               class="btn-primary"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Elegir un plan
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    ¿Preguntas? Responde a este correo o visita la configuración de facturación de tu práctica.
</p>
@endsection
