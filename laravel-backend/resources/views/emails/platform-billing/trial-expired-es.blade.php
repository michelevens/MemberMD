@extends('emails.layout')

@section('header_subtitle', 'Prueba terminada')

@section('preheader')
Tu prueba de MemberMD ha terminado. Elige un plan para reactivar {{ $practiceName }}.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Tu prueba de MemberMD ha terminado
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    La prueba de 30 días de {{ $practiceName }} en MemberMD ha terminado. Tus datos están a salvo y sin cambios
    &mdash; los pacientes y proveedores existentes pueden seguir iniciando sesión &mdash; pero las nuevas
    inscripciones y citas están pausadas hasta que elijas un plan.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fef3c7; border-radius: 8px; border: 1px solid #fcd34d;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                <strong>Pausado:</strong> crear nuevos proveedores, programas e inscripciones de pacientes.<br>
                <strong>Funciona:</strong> datos existentes, accesos de miembros, visitas programadas.
            </p>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/practice/settings?tab=subscription"
               class="btn-primary"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Elegir un plan para reactivar
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    Los planes empiezan en $19/mes. Cancela en cualquier momento. Responde a este correo si quieres conversar sobre cuál plan te conviene.
</p>
@endsection
