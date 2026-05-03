@extends('emails.layout')

@section('header_subtitle', 'Pago fallido')

@section('preheader')
No pudimos procesar tu pago de MemberMD. Actualiza tu tarjeta para continuar.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    No pudimos procesar tu pago
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Tu factura más reciente de MemberMD para {{ $practiceName }} no se procesó.
    Lo más común es una tarjeta vencida, un rechazo temporal del banco, o fondos insuficientes.
    Stripe reintentará automáticamente durante los próximos días, pero actualizar tu tarjeta ahora es más rápido.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #b91c1c; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Monto pendiente</p>
            <p style="margin: 0; font-size: 22px; color: #7f1d1d; font-weight: 700;">
                ${{ number_format($amountDollars, 2) }}
            </p>
            @if($plan)
                <p style="margin: 4px 0 0; font-size: 13px; color: #991b1b;">Plan {{ $plan->name }}</p>
            @endif
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 16px;">
    <tr>
        @if($invoice->hosted_invoice_url)
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ $invoice->hosted_invoice_url }}"
               class="btn-primary"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Pagar factura ahora
            </a>
        </td>
        @else
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/practice/settings?tab=subscription"
               class="btn-primary"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Actualizar método de pago
            </a>
        </td>
        @endif
    </tr>
</table>

<p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    Si no podemos cobrar en unos días, tu suscripción pasará a estado "pago atrasado" &mdash; mantendrás el acceso, pero las nuevas inscripciones podrían pausarse. Responde a este correo si necesitas ayuda.
</p>
@endsection
