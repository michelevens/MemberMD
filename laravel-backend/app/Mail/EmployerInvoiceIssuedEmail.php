<?php

namespace App\Mail;

use App\Models\Employer;
use App\Models\EmployerInvoice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to HR when the monthly invoice cycle generates a new PEPM
 * invoice. Routes through MailDispatcher with the
 * 'employer.invoice_issued' registry key so the practice can disable
 * auto-emailing if they prefer to send invoices manually.
 */
class EmployerInvoiceIssuedEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Employer $employer,
        public readonly EmployerInvoice $invoice,
    ) {}

    public function envelope(): Envelope
    {
        $period = \Carbon\Carbon::parse($this->invoice->period_start)->format('M Y');
        return new Envelope(
            subject: "Invoice {$this->invoice->invoice_number} — {$this->employer->name} ({$period})",
        );
    }

    public function content(): Content
    {
        $frontend = rtrim((string) env('FRONTEND_URL', 'https://app.membermd.io'), '/');
        $portalUrl = $frontend . '/#/employer/invoices';

        return new Content(
            view: 'emails.employer-invoice-issued',
            with: [
                'employer' => $this->employer,
                'invoice' => $this->invoice,
                'periodLabel' => \Carbon\Carbon::parse($this->invoice->period_start)->format('F Y'),
                'portalUrl' => $portalUrl,
            ],
        );
    }
}
