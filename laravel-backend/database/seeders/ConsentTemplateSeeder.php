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

            // ─── DPC Membership Agreement (the contract itself) ─────────────
            // This is the contract the patient signs to subscribe. Practices
            // bind it to a MembershipPlan via the new agreement_template_id
            // FK; patients see this exact template (with plan entitlements
            // appended) at enrollment time and on download from their portal.
            [
                'type' => 'membership_agreement',
                'name' => 'Direct Primary Care Membership Agreement',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => "# Direct Primary Care Membership Agreement\n\n" .
                    'This Direct Primary Care Membership Agreement (the "Agreement") is entered into between the patient identified below (the "Member") and the Practice for participation in a direct primary care membership program ("Membership"). By signing this Agreement, the Member agrees to be bound by its terms and acknowledges receipt of all included exhibits and entitlements.' . "\n\n" .
                    "## 1. Membership Services\n" .
                    'The Practice agrees to provide the Member with the medical services and amenities listed in the **Plan Entitlements** table at the end of this Agreement. Services are delivered directly by the Practice without billing the Member\'s health insurance for those covered by the Membership. Services not covered by the Membership are billed separately at the rates listed in the practice fee schedule.' . "\n\n" .
                    "## 2. Membership Fee\n" .
                    'The Member agrees to pay the recurring Membership Fee at the frequency and amount stated in the Plan Entitlements table. The fee is charged automatically to the payment method on file at the start of each billing period. The Member is responsible for keeping a valid payment method on file. Membership fees are exclusive of one-time enrollment or intake fees, which are charged at the start of Membership and are non-refundable except as required by law.' . "\n\n" .
                    "## 3. Term and Termination\n" .
                    "This Agreement begins on the Member's enrollment date and continues month-to-month (or for the elected annual term). The Member may cancel at any time consistent with the cancellation terms in the Plan Entitlements table — typically end-of-period cancellation. The Practice may terminate this Agreement for non-payment, breach of this Agreement, behavior that endangers staff or other patients, or for any reason allowed by applicable law.\n\n" .
                    "## 4. Not Health Insurance\n" .
                    'The Member acknowledges that **this Membership is NOT health insurance**. The Membership does not satisfy any individual mandate requirements for health insurance under federal or state law. The Practice does not bill health insurance for services covered under the Membership. The Member is responsible for maintaining appropriate health insurance for hospital care, emergency services, specialist care, prescription medications, diagnostic imaging, laboratory services not included in the Membership, and any care not provided directly by the Practice. The Member acknowledges that the Practice has advised the Member to obtain or maintain comprehensive health insurance.' . "\n\n" .
                    "## 5. Scope of Care\n" .
                    'The Practice provides primary care services and the specific services listed in the Plan Entitlements table. The Practice does not provide emergency care, specialty care outside its scope of license, hospital services, or services that the Practice has determined are outside its clinical capability. In emergencies, the Member should call 911 or go to the nearest emergency department.' . "\n\n" .
                    "## 6. Fees, Refunds, and Disputes\n" .
                    'Recurring Membership fees are non-refundable for periods already provided. Disputed charges must be raised in writing within thirty (30) days of the charge. The Practice will investigate and respond within a reasonable time. The Member agrees to attempt good-faith resolution of any disputes with the Practice before pursuing other remedies.' . "\n\n" .
                    "## 7. Privacy and Records\n" .
                    'The Member\'s health information is protected by HIPAA and applicable state law. The separate **Notice of Privacy Practices** describes how the Practice uses and discloses health information. By signing this Agreement, the Member acknowledges receipt of the Notice of Privacy Practices.' . "\n\n" .
                    "## 8. Changes to This Agreement\n" .
                    'The Practice may modify the terms of this Agreement upon thirty (30) days\' written notice (which may be delivered electronically). The Member\'s continued payment of Membership fees after the effective date of the change constitutes acceptance of the new terms. The Member may terminate the Membership before the change takes effect if they do not agree.' . "\n\n" .
                    "## 9. Governing Law\n" .
                    'This Agreement is governed by the laws of the state in which the Practice is licensed, without regard to conflict of law principles. Any dispute arising out of or related to this Agreement will be resolved in the state and federal courts located in that state.' . "\n\n" .
                    "## 10. Entire Agreement\n" .
                    'This Agreement, together with the Plan Entitlements table and the Notice of Privacy Practices, constitutes the entire agreement between the Member and the Practice with respect to the Membership and supersedes any prior agreements or understandings.' . "\n\n" .
                    'By signing below, the Member acknowledges that they have read this Agreement in full, have had an opportunity to ask questions, understand that the Membership is not health insurance, and agree to be bound by all of its terms. The Plan Entitlements table is incorporated into this Agreement by reference.',
            ],

            // ─── HIPAA Release of Information — Authorization to RELEASE records to a third party ───
            [
                'type' => 'roi_release',
                'name' => 'Authorization to Release Health Information',
                'specialty' => null,
                'is_required' => false,
                'version' => '1.0',
                'content' => "## Authorization to Release Protected Health Information\n\n" .
                    'I hereby authorize this Practice to release my protected health information (PHI) to the recipient(s) named below.' . "\n\n" .
                    "## 1. Information to be Released\n" .
                    'This authorization covers all information in my medical record relevant to the purpose stated below, unless I specify otherwise in writing to the Practice. This may include progress notes, lab results, imaging reports, medication history, immunization records, and other clinical data.' . "\n\n" .
                    "## 2. Sensitive Information\n" .
                    'I understand that my records may contain information related to mental health, substance use treatment, HIV/AIDS status, or genetic testing. By signing this authorization, I specifically consent to the release of such sensitive information unless I check the following box: ☐ I do NOT authorize the release of sensitive information.' . "\n\n" .
                    "## 3. Purpose of Release\n" .
                    'The purpose of this release is to support continuity of care, coordinate treatment with another provider, respond to a request from me, or as otherwise specified in writing.' . "\n\n" .
                    "## 4. Right to Revoke\n" .
                    'I understand that I may revoke this authorization at any time by writing to the Practice, except to the extent that the Practice has already acted in reliance on it. Revocation will not affect any disclosures already made.' . "\n\n" .
                    "## 5. Expiration\n" .
                    'This authorization expires one (1) year from the date signed unless an earlier date is specified.' . "\n\n" .
                    "## 6. Conditions of Treatment\n" .
                    'I understand that my treatment, payment, enrollment, or eligibility for benefits cannot be conditioned on whether I sign this authorization, except as permitted by law.' . "\n\n" .
                    "## 7. Re-disclosure Notice\n" .
                    'I understand that information disclosed pursuant to this authorization may be subject to re-disclosure by the recipient and may no longer be protected by federal privacy regulations.' . "\n\n" .
                    'By signing below, I acknowledge that I have read and understand this authorization and consent to the release of my protected health information as described above.',
            ],

            // ─── HIPAA Release of Information — Authorization to OBTAIN records from another provider ───
            [
                'type' => 'roi_obtain',
                'name' => 'Authorization to Obtain Health Information',
                'specialty' => null,
                'is_required' => false,
                'version' => '1.0',
                'content' => "## Authorization to Obtain Protected Health Information\n\n" .
                    'I hereby authorize the Practice to request and receive my protected health information (PHI) from the source(s) named below for the purpose of supporting my care.' . "\n\n" .
                    "## 1. Information Requested\n" .
                    'This authorization covers all information in my medical record at the named source relevant to the purpose stated below, including progress notes, lab and imaging reports, medication and immunization history, and other clinical data.' . "\n\n" .
                    "## 2. Sensitive Information\n" .
                    'I understand that the records I am authorizing to be obtained may contain information related to mental health, substance use treatment, HIV/AIDS status, or genetic testing. By signing this authorization, I specifically consent to the disclosure of such sensitive information to the Practice unless I check the following box: ☐ I do NOT authorize disclosure of sensitive information.' . "\n\n" .
                    "## 3. Purpose\n" .
                    'The purpose of this authorization is to allow the Practice to obtain my prior medical history so my care team has a complete picture of my health.' . "\n\n" .
                    "## 4. Right to Revoke\n" .
                    'I may revoke this authorization at any time by writing to the Practice, except to the extent that the source has already acted in reliance on it.' . "\n\n" .
                    "## 5. Expiration\n" .
                    'This authorization expires one (1) year from the date signed unless an earlier date is specified.' . "\n\n" .
                    "## 6. Conditions of Treatment\n" .
                    'My treatment, payment, enrollment, or eligibility for benefits cannot be conditioned on whether I sign this authorization, except as permitted by law.' . "\n\n" .
                    "## 7. Re-disclosure Notice\n" .
                    'Information received by the Practice from the named source becomes part of my medical record and is protected under HIPAA and applicable state law.' . "\n\n" .
                    'By signing below, I authorize the Practice to obtain my protected health information as described above.',
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
