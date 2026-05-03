@extends('emails.layout')

@section('header_subtitle', 'Factura ajustada')

@section('preheader')
Tu factura de MemberMD bajó — ajustamos automáticamente tu capacidad de miembros.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Tu factura de MemberMD bajó
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Buenas noticias para {{ $practiceName }} &mdash; tu cantidad de miembros ha estado por debajo de tu capacidad
    contratada durante 60 días, así que ajustamos automáticamente tu plan para ahorrarte dinero. No necesitas
    hacer nada.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #b8e6d2;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #047857; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Capacidad actualizada</p>
            <p style="margin: 0; font-size: 18px; color: #064e3b; font-weight: 700;">
                {{ $newCapacity }} miembros
            </p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #065f46;">
                Antes era {{ $oldCapacity }} miembros &middot; ahorras ${{ number_format($monthlySavings, 2) }}/mes
            </p>
        </td>
    </tr>
</table>

<p style="margin: 0 0 16px; font-size: 14px; color: #4a5568; line-height: 1.6;">
    Si vuelves a superar los {{ $newCapacity }} miembros activos, puedes comprar otro bloque de capacidad desde la configuración de tu práctica &mdash; sin necesidad de cambiar de plan.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="border: 1px solid #e2e8f0; border-radius: 8px;">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/practice/settings?tab=subscription"
               class="btn-outline"
               style="display: inline-block; padding: 10px 24px; font-size: 13px; font-weight: 600; color: #475569; text-decoration: none; border-radius: 8px;">
                Ver suscripción
            </a>
        </td>
    </tr>
</table>
@endsection
