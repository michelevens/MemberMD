<?php

namespace Database\Seeders;

use App\Models\ConsentTemplate;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;

class ConsentTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $seeded = 0;
        $templates = [
            // ─── HIPAA Notice of Privacy Practices ───
            [
                'type' => 'hipaa',
                'name' => 'HIPAA Notice of Privacy Practices',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => 'NOTICE OF PRIVACY PRACTICES' . "\n\n" .
                    'THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.' . "\n\n" .
                    'I. OUR COMMITMENT TO YOUR PRIVACY' . "\n" .
                    'This practice is committed to maintaining the privacy of your protected health information (PHI). We are required by the Health Insurance Portability and Accountability Act of 1996 (HIPAA) and applicable state law to maintain the privacy of your health information and to provide you with this Notice.' . "\n\n" .
                    'II. HOW WE MAY USE AND DISCLOSE YOUR HEALTH INFORMATION' . "\n" .
                    'A. Treatment: We may use and disclose your PHI to provide, coordinate, or manage your health care, including consultations and referrals.' . "\n" .
                    'B. Payment: We may use and disclose your PHI to bill and collect payment for services, including contacting your insurance company or third-party payer.' . "\n" .
                    'C. Health Care Operations: We may use and disclose your PHI for quality assessment, credentialing, and staff training.' . "\n" .
                    'D. As Required by Law: We will disclose your PHI when required by federal, state, or local law, including public health activities, health oversight, judicial proceedings, and law enforcement purposes.' . "\n\n" .
                    'III. YOUR RIGHTS' . "\n" .
                    'You have the right to: inspect and copy your PHI; request amendments to your records; receive an accounting of disclosures; request restrictions on uses and disclosures; request confidential communications; and obtain a paper copy of this Notice.' . "\n\n" .
                    'IV. OUR DUTIES' . "\n" .
                    'We are required by law to maintain the privacy of your PHI, provide this Notice, and notify you following a breach of unsecured PHI. We reserve the right to change our privacy practices and will provide a revised Notice if material changes are made.' . "\n\n" .
                    'V. COMPLAINTS' . "\n" .
                    'If you believe your privacy rights have been violated, you may file a complaint with our practice or with the Secretary of the U.S. Department of Health and Human Services. You will not be retaliated against for filing a complaint.' . "\n\n" .
                    'By signing below, you acknowledge that you have received a copy of this Notice of Privacy Practices.',
            ],

            // ─── Consent to Treatment ───
            [
                'type' => 'treatment',
                'name' => 'Consent to Treatment',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => 'CONSENT TO TREATMENT' . "\n\n" .
                    'I. PURPOSE' . "\n" .
                    'This document confirms your voluntary consent to receive medical and/or psychiatric evaluation, treatment, and services provided by this practice and its authorized providers.' . "\n\n" .
                    'II. SCOPE OF CONSENT' . "\n" .
                    'By signing this form, I consent to: clinical interviews, examinations, diagnostic assessments, psychological testing, and laboratory studies as recommended by my provider. Treatment may include medication management, psychotherapy and counseling (individual, group, or family), care coordination, referrals, preventive care, and procedures appropriate to the clinical setting. In a medical emergency, I consent to any emergency treatment deemed necessary.' . "\n\n" .
                    'III. RISKS AND BENEFITS' . "\n" .
                    'Benefits may include improvement of symptoms, better understanding of conditions, and enhanced quality of life. Risks may include medication side effects, emotional discomfort during therapy, the possibility that treatment may not achieve desired outcomes, and potential worsening of symptoms before improvement. Alternatives to proposed treatment exist, including no treatment, and my provider will discuss options with me.' . "\n\n" .
                    'IV. PATIENT RESPONSIBILITIES' . "\n" .
                    'I agree to provide accurate health information, follow the agreed-upon treatment plan, inform my provider of changes in my condition, notify the practice of cancellations, and inform my provider if I wish to discontinue treatment.' . "\n\n" .
                    'V. RIGHT TO REFUSE OR WITHDRAW' . "\n" .
                    'I have the right to refuse or withdraw consent for any treatment at any time. My provider will explain any potential consequences of refusal or withdrawal.' . "\n\n" .
                    'VI. MINORS AND GUARDIANS' . "\n" .
                    'If the patient is a minor or has a legal guardian, the parent or legal guardian signature is required and constitutes consent on behalf of the patient.' . "\n\n" .
                    'By signing below, I acknowledge that I have read and understand this Consent to Treatment, have had the opportunity to ask questions, and voluntarily consent to treatment.',
            ],

            // ─── Telehealth Informed Consent ───
            [
                'type' => 'telehealth',
                'name' => 'Telehealth Informed Consent',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => 'TELEHEALTH INFORMED CONSENT' . "\n\n" .
                    'I. INTRODUCTION' . "\n" .
                    'Telehealth involves the use of electronic communications, including video conferencing, telephone, and secure messaging, to provide clinical services at a distance.' . "\n\n" .
                    'II. SERVICES' . "\n" .
                    'Telehealth services may include clinical evaluations, medication management, psychotherapy and counseling, care coordination, review of diagnostic results, and patient education.' . "\n\n" .
                    'III. BENEFITS' . "\n" .
                    'Telehealth improves access to care, reduces travel time, enables timely follow-up and medication management, and provides continuity of care when in-person visits are not possible.' . "\n\n" .
                    'IV. RISKS AND LIMITATIONS' . "\n" .
                    'Technology failures may interrupt sessions. Despite security measures, electronic communications could be intercepted. Providers cannot perform physical examinations remotely. In rare cases, transmitted information may not be sufficient for appropriate clinical decisions.' . "\n\n" .
                    'V. TECHNOLOGY AND PRIVACY' . "\n" .
                    'A reliable internet connection and a device with camera and microphone are recommended. I agree to participate from a private location. All sessions use HIPAA-compliant, encrypted technology. Sessions will not be recorded without written consent.' . "\n\n" .
                    'VI. EMERGENCY PROTOCOLS' . "\n" .
                    'Telehealth is NOT appropriate for medical emergencies. In an emergency, call 911 or go to the nearest emergency room. I agree to provide my current physical location and a contact phone number at the start of each session. My provider may recommend an in-person visit if telehealth is not appropriate for my condition.' . "\n\n" .
                    'VII. RIGHT TO WITHDRAW' . "\n" .
                    'I may withdraw consent to telehealth at any time and may request an in-person visit at any time without affecting my right to future care.' . "\n\n" .
                    'By signing below, I acknowledge that I have read and understand this Telehealth Informed Consent and voluntarily consent to receiving telehealth services.',
            ],

            // ─── Controlled Substance Agreement ───
            [
                'type' => 'controlled_substance',
                'name' => 'Controlled Substance Agreement',
                'specialty' => 'psychiatry',
                'is_required' => false,
                'version' => '1.0',
                'content' => 'CONTROLLED SUBSTANCE AGREEMENT' . "\n\n" .
                    'I. PURPOSE' . "\n" .
                    'This agreement outlines the conditions under which controlled substances (Schedule II-V medications) may be prescribed. Its purpose is to ensure safe and effective use, prevent misuse, and comply with federal and state regulations.' . "\n\n" .
                    'II. PATIENT RESPONSIBILITIES' . "\n" .
                    'I agree to: receive controlled substance prescriptions from only one prescriber at this practice; use a single pharmacy and notify my provider of any changes; keep all scheduled appointments; take medications exactly as prescribed; and store medications securely. I will not increase dosages without authorization, share or distribute medications, use illicit substances, or consume excess alcohol while taking controlled medications. Lost or stolen medications will not be replaced.' . "\n\n" .
                    'III. MONITORING' . "\n" .
                    'I agree to submit to random or scheduled urine drug screens, blood tests, or other monitoring as requested. I consent to my provider checking the state Prescription Drug Monitoring Program (PDMP). I agree to bring medications for pill counts if requested and authorize the release of relevant medical records to coordinate prescribing.' . "\n\n" .
                    'IV. GROUNDS FOR DISCONTINUATION' . "\n" .
                    'Prescribing may be discontinued if: drug screen results are inconsistent with prescribed medications; there is evidence of misuse, diversion, or non-compliance; I fail to attend appointments; I violate any term of this agreement; or it is clinically determined the medication is no longer appropriate.' . "\n\n" .
                    'V. TAPERING' . "\n" .
                    'If discontinuation is necessary, an appropriate tapering schedule will be provided to ensure safe discontinuation.' . "\n\n" .
                    'By signing below, I acknowledge that I have read and understand this Controlled Substance Agreement, have had the opportunity to ask questions, and agree to abide by its terms.',
            ],

            // ─── Financial Agreement ───
            [
                'type' => 'financial',
                'name' => 'Financial Agreement',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => 'FINANCIAL AGREEMENT' . "\n\n" .
                    'I. MEMBERSHIP MODEL' . "\n" .
                    'This practice operates on a membership-based model. By enrolling, you agree to the following financial terms.' . "\n\n" .
                    'II. MEMBERSHIP FEES AND BILLING' . "\n" .
                    'My membership plan includes a recurring fee (monthly or annual) as outlined in my selected plan, covering the services described in my membership agreement. Fees are billed in advance on a recurring basis. I agree to maintain a valid payment method on file. Continued failure to pay may result in suspension or termination of membership.' . "\n\n" .
                    'III. CANCELLATION AND REFUNDS' . "\n" .
                    'I may cancel my membership at any time by providing written notice through the patient portal or by contacting the practice. Cancellation is effective at the end of the current billing period. Monthly memberships are not refundable for partial months. Annual memberships may be prorated if canceled within 30 days of renewal.' . "\n\n" .
                    'IV. SERVICES NOT COVERED' . "\n" .
                    'The following are generally not included in membership fees: laboratory tests and imaging, specialist referrals, prescriptions and medications, procedures not specified in my plan, add-on services, and supplies.' . "\n\n" .
                    'V. MISSED APPOINTMENTS' . "\n" .
                    'I agree to provide at least 24 hours notice for cancellations. Missed appointments without adequate notice may be subject to a no-show fee. Repeated no-shows may be grounds for membership review.' . "\n\n" .
                    'VI. INSURANCE' . "\n" .
                    'Membership fees are generally not submitted to insurance. The practice may provide superbills for potential reimbursement, but reimbursement is not guaranteed.' . "\n\n" .
                    'By signing below, I acknowledge that I have read, understand, and agree to this Financial Agreement.',
            ],

            // ─── Communications Consent ───
            [
                'type' => 'communications',
                'name' => 'Communications Consent',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => 'COMMUNICATIONS CONSENT' . "\n\n" .
                    'I. PURPOSE' . "\n" .
                    'This consent authorizes this practice to communicate with you through various electronic and traditional channels for healthcare services, appointment management, and practice communications.' . "\n\n" .
                    'II. AUTHORIZED CHANNELS' . "\n" .
                    'I authorize the practice to communicate with me through: the secure patient portal (HIPAA-compliant messaging, recommended for clinical matters); email at the address I have provided; text messages (SMS) for appointment reminders, medication reminders, billing notifications, and practice announcements; telephone for scheduling, clinical follow-up, billing inquiries, and urgent communications; and voicemail with limited appointment information.' . "\n\n" .
                    'III. PRIVACY NOTICE' . "\n" .
                    'I understand that standard email and SMS may not be fully encrypted. The secure patient portal is the recommended method for discussing clinical matters. Portal messaging is not appropriate for emergencies. In an emergency, I will call 911.' . "\n\n" .
                    'IV. MARKETING COMMUNICATIONS' . "\n" .
                    'The practice may send informational communications about new services, health education, wellness tips, and practice updates. I may opt out of non-essential marketing communications at any time without affecting my care.' . "\n\n" .
                    'V. PREFERENCES AND REVOCATION' . "\n" .
                    'I may specify and update my preferred contact method at any time through the patient portal. I may revoke this consent at any time by submitting a written request. Revocation will not affect communications that occurred before the revocation.' . "\n\n" .
                    'By signing below, I acknowledge that I have read and understand this Communications Consent and authorize the practice to communicate with me through the channels described above.',
            ],
        ];

        foreach ($templates as $template) {
            try {
                // PostgreSQL: NULL != NULL in WHERE, so use whereNull instead of updateOrCreate
                $existing = ConsentTemplate::where('type', $template['type'])
                    ->whereNull('tenant_id')
                    ->first();

                $data = [
                    'name' => $template['name'],
                    'specialty' => $template['specialty'],
                    'is_required' => $template['is_required'],
                    'version' => $template['version'],
                    'content' => $template['content'],
                    'is_active' => true,
                ];

                if ($existing) {
                    $existing->update($data);
                } else {
                    ConsentTemplate::create(array_merge($data, [
                        'type' => $template['type'],
                        'tenant_id' => null,
                    ]));
                }

                $seeded++;
            } catch (\Throwable $e) {
                $this->command->error("Failed to seed consent template [{$template['type']}]: " . $e->getMessage());
                Log::error('ConsentTemplateSeeder failed', ['type' => $template['type'], 'error' => $e->getMessage()]);
            }
        }

        $this->command->info("Seeded {$seeded} consent templates.");
    }
}
