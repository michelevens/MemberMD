<?php

namespace Database\Seeders;

use App\Models\ConsentTemplate;
use Illuminate\Database\Seeder;

class ConsentTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $templates = [
            // ─── HIPAA Notice of Privacy Practices ───
            [
                'type' => 'hipaa',
                'name' => 'HIPAA Notice of Privacy Practices',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => <<<'HIPAA'
NOTICE OF PRIVACY PRACTICES

THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.

EFFECTIVE DATE: Upon signing

I. OUR COMMITMENT TO YOUR PRIVACY

This practice is committed to maintaining the privacy of your protected health information (PHI). PHI is information that may identify you and that relates to your past, present, or future physical or mental health condition, the provision of health care services to you, or the payment for such services. We are required by the Health Insurance Portability and Accountability Act of 1996 (HIPAA) and applicable state law to maintain the privacy of your health information, to provide you with this Notice of our legal duties and privacy practices with respect to your PHI, and to abide by the terms of the Notice currently in effect.

II. HOW WE MAY USE AND DISCLOSE YOUR HEALTH INFORMATION

A. Treatment: We may use and disclose your PHI to provide, coordinate, or manage your health care and related services. This includes consultations between health care providers regarding your care and referrals to other health care providers.

B. Payment: We may use and disclose your PHI to bill and collect payment for the services we provide to you. This may include contacting your health insurance company, membership plan administrator, or other third-party payer.

C. Health Care Operations: We may use and disclose your PHI for our health care operations, including quality assessment, credentialing, and training of staff.

D. As Required by Law: We will disclose your PHI when required to do so by federal, state, or local law.

E. Public Health Activities: We may disclose your PHI for public health activities, including reporting to public health authorities for the prevention or control of disease, injury, or disability.

F. Health Oversight Activities: We may disclose your PHI to a health oversight agency for activities authorized by law, such as audits, investigations, and inspections.

G. Judicial and Administrative Proceedings: We may disclose your PHI in response to a court or administrative order, subpoena, discovery request, or other lawful process.

H. Law Enforcement: We may disclose your PHI for law enforcement purposes as required by law or in response to a valid court order, warrant, summons, or similar process.

I. To Avert a Serious Threat to Health or Safety: We may use and disclose your PHI when necessary to prevent a serious threat to the health and safety of you, another person, or the public.

J. Specialized Government Functions: We may disclose your PHI for military, national security, or intelligence activities, or for the protective services of the President.

K. Workers' Compensation: We may disclose your PHI as authorized by and to the extent necessary to comply with workers' compensation laws.

III. YOUR RIGHTS REGARDING YOUR HEALTH INFORMATION

A. Right to Inspect and Copy: You have the right to inspect and obtain a copy of your PHI maintained by us. Requests must be made in writing. We may charge a reasonable fee for copying costs.

B. Right to Amend: You have the right to request that we amend your PHI if you believe it is incorrect or incomplete. Requests must be made in writing with a reason for the amendment.

C. Right to an Accounting of Disclosures: You have the right to request a list of disclosures we have made of your PHI, other than for treatment, payment, health care operations, and certain other activities.

D. Right to Request Restrictions: You have the right to request restrictions on how we use or disclose your PHI for treatment, payment, or health care operations. We are not required to agree to your request except as required by law.

E. Right to Request Confidential Communications: You have the right to request that we communicate with you about health matters in a certain way or at a certain location.

F. Right to a Paper Copy of This Notice: You have the right to obtain a paper copy of this Notice, even if you have agreed to receive the Notice electronically.

IV. OUR DUTIES

We are required by law to maintain the privacy of your PHI, to provide you with notice of our legal duties and privacy practices, and to notify you following a breach of unsecured PHI. We reserve the right to change our privacy practices and to make the new provisions effective for all PHI we maintain. If we make material changes, we will provide you with a revised Notice.

V. COMPLAINTS

If you believe your privacy rights have been violated, you may file a complaint with our practice or with the Secretary of the U.S. Department of Health and Human Services. You will not be retaliated against for filing a complaint.

VI. CONTACT INFORMATION

For questions about this Notice or to exercise your rights, please contact your practice administrator using the contact information provided in your patient portal.

By signing below, you acknowledge that you have received a copy of this Notice of Privacy Practices.
HIPAA,
            ],

            // ─── Consent to Treatment ───
            [
                'type' => 'treatment',
                'name' => 'Consent to Treatment',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => <<<'TREATMENT'
CONSENT TO TREATMENT

I. PURPOSE

This document confirms your voluntary consent to receive medical and/or psychiatric evaluation, treatment, and services provided by this practice and its authorized providers.

II. SCOPE OF CONSENT

By signing this form, I consent to the following:

A. Evaluation and Assessment: I consent to clinical interviews, mental status examinations, physical examinations (as applicable), diagnostic assessments, psychological testing, and laboratory studies as recommended by my provider.

B. Treatment: I consent to treatment as recommended by my provider, which may include but is not limited to:
   - Medication management (including prescribing, adjusting, and monitoring medications)
   - Psychotherapy and counseling (individual, group, or family)
   - Care coordination and referrals to specialists
   - Preventive care and wellness services
   - Procedures appropriate to the clinical setting

C. Emergency Treatment: In the event of a medical emergency, I consent to any emergency treatment deemed necessary by the treating provider.

III. RISKS AND BENEFITS

A. Benefits: Treatment may result in improvement of symptoms, better understanding of conditions, improved functioning, and enhanced quality of life.

B. Risks: All medical and psychiatric treatments carry potential risks, including but not limited to:
   - Medication side effects (which will be discussed with you before prescribing)
   - Emotional discomfort during therapeutic discussions
   - The possibility that treatment may not achieve desired outcomes
   - Potential for worsening of symptoms before improvement

C. Alternatives: I understand that alternatives to proposed treatment exist, including no treatment, and that my provider will discuss available options with me.

IV. PATIENT RESPONSIBILITIES

I agree to:
   - Provide accurate and complete health information
   - Follow the treatment plan agreed upon with my provider
   - Inform my provider of any changes in my condition
   - Notify the practice if I need to cancel or reschedule appointments
   - Inform my provider if I wish to discontinue treatment

V. RIGHT TO REFUSE OR WITHDRAW

I understand that I have the right to refuse or withdraw consent for any treatment at any time. I understand that refusal or withdrawal of consent may affect my health outcomes, and my provider will explain any potential consequences.

VI. MINORS AND GUARDIANS

If the patient is a minor or has a legal guardian, the parent or legal guardian's signature is required and constitutes consent on behalf of the patient.

By signing below, I acknowledge that I have read and understand this Consent to Treatment, have had the opportunity to ask questions, and voluntarily consent to treatment.
TREATMENT,
            ],

            // ─── Telehealth Informed Consent ───
            [
                'type' => 'telehealth',
                'name' => 'Telehealth Informed Consent',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => <<<'TELEHEALTH'
TELEHEALTH INFORMED CONSENT

I. INTRODUCTION

Telehealth involves the use of electronic communications, including video conferencing, telephone, secure messaging, and other technologies, to provide clinical services at a distance. This consent form provides information about telehealth services offered by this practice.

II. NATURE OF TELEHEALTH SERVICES

Telehealth services may include, but are not limited to:
   - Clinical evaluations and assessments
   - Medication management and follow-up visits
   - Psychotherapy and counseling sessions
   - Care coordination and consultation
   - Review of diagnostic results
   - Patient education

III. BENEFITS OF TELEHEALTH

   - Improved access to care, especially for patients in remote areas
   - Convenience and reduced travel time
   - Timely follow-up and medication management
   - Continuity of care during circumstances preventing in-person visits

IV. RISKS AND LIMITATIONS

I understand that telehealth has potential risks and limitations, including but not limited to:
   - Technology failures may interrupt or prevent sessions
   - Despite reasonable security measures, electronic communications could be intercepted
   - Limitations in the provider's ability to perform a physical examination
   - Delays in evaluation and treatment due to technology deficiencies
   - In rare cases, information transmitted may not be sufficient to allow for appropriate clinical decision-making

V. TECHNOLOGY REQUIREMENTS

   - A reliable internet connection is recommended for video visits
   - A device with a camera and microphone (computer, tablet, or smartphone)
   - A private, quiet location for the duration of the visit
   - The practice uses HIPAA-compliant telehealth platforms

VI. PRIVACY AND CONFIDENTIALITY

   - All telehealth sessions are conducted using HIPAA-compliant, encrypted technology
   - I agree to participate from a private location
   - I understand that, as with any electronic communication, there is a risk of breach despite security measures
   - Sessions will not be recorded by the practice unless written consent is obtained

VII. EMERGENCY PROTOCOLS

   - Telehealth is NOT appropriate for medical emergencies. In an emergency, call 911 or go to the nearest emergency room
   - I agree to provide my current physical location at the beginning of each telehealth session
   - I agree to provide a phone number where I can be reached in case of a technology failure
   - I understand that my provider may determine that telehealth is not appropriate for my condition and may recommend an in-person visit

VIII. RIGHT TO WITHDRAW

   - I may withdraw my consent to telehealth services at any time without affecting my right to future care
   - I may request an in-person visit at any time

By signing below, I acknowledge that I have read and understand this Telehealth Informed Consent, have had the opportunity to ask questions, and voluntarily consent to receiving telehealth services.
TELEHEALTH,
            ],

            // ─── Controlled Substance Agreement ───
            [
                'type' => 'controlled_substance',
                'name' => 'Controlled Substance Agreement',
                'specialty' => 'psychiatry',
                'is_required' => false,
                'version' => '1.0',
                'content' => <<<'CONTROLLED'
CONTROLLED SUBSTANCE AGREEMENT

I. PURPOSE

This agreement outlines the conditions under which controlled substances (Schedule II-V medications) may be prescribed by this practice. The purpose of this agreement is to ensure the safe and effective use of these medications, prevent misuse and diversion, and comply with federal and state regulations.

II. PATIENT RESPONSIBILITIES

By signing this agreement, I understand and agree to the following:

A. Single Prescriber: I will receive controlled substance prescriptions from only one prescriber at this practice. I will not seek controlled substance prescriptions from other providers, emergency rooms, or urgent care centers without prior approval from my prescribing provider.

B. Single Pharmacy: I will use a single pharmacy for all controlled substance prescriptions and will notify my provider in advance if I need to change pharmacies.

C. Appointments: I will keep all scheduled appointments. Failure to attend follow-up appointments may result in discontinuation of controlled substance prescriptions. Controlled substances will not be refilled between scheduled appointments except in unusual circumstances approved by my provider.

D. Medication Use: I will take medications exactly as prescribed. I will not:
   - Increase the dose without provider authorization
   - Share, sell, or otherwise distribute my medication to any other person
   - Use any illicit substances while taking controlled medications
   - Consume alcohol in excess while taking controlled medications (as discussed with my provider)

E. Storage and Security: I will store medications in a secure location. Lost or stolen medications will not be replaced. I understand that frequent reports of lost or stolen medications may result in discontinuation of prescribing.

F. Refills: I will request refills during regular office hours and understand that refills may require an appointment. I will not request early refills.

III. MONITORING

A. Drug Testing: I agree to submit to random and/or scheduled urine drug screens, blood tests, or other monitoring as requested by my provider. Refusal to submit to testing may result in discontinuation of controlled substance prescribing.

B. Prescription Drug Monitoring Program (PDMP): I consent to my provider checking the state Prescription Drug Monitoring Program as required by law and clinical judgment.

C. Pill Counts: I agree to bring medications to appointments for pill counts if requested.

D. Medical Records: I authorize the release of relevant medical records to and from other providers involved in my care for the purpose of coordinating controlled substance prescribing.

IV. GROUNDS FOR DISCONTINUATION

Controlled substance prescribing may be discontinued if:
   - Drug screen results are inconsistent with prescribed medications
   - Evidence of medication misuse, diversion, or non-compliance
   - Failure to attend follow-up appointments
   - Violation of any term in this agreement
   - Clinical determination that the medication is no longer appropriate

V. TAPERING AND DISCONTINUATION

If my provider determines that controlled substances should be discontinued, I understand that an appropriate tapering schedule will be provided to ensure safe discontinuation. Abrupt discontinuation may cause withdrawal symptoms and is avoided when clinically appropriate.

VI. ACKNOWLEDGMENT

I have read and understand this Controlled Substance Agreement. I have had the opportunity to ask questions. I agree to abide by the terms outlined above. I understand that violation of this agreement may result in discontinuation of controlled substance prescribing and possible discharge from the practice.
CONTROLLED,
            ],

            // ─── Financial Agreement ───
            [
                'type' => 'financial',
                'name' => 'Financial Agreement',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => <<<'FINANCIAL'
FINANCIAL AGREEMENT

I. MEMBERSHIP MODEL

This practice operates on a membership-based Direct Primary Care (DPC) or concierge model. By enrolling, you agree to the following financial terms:

A. Membership Fees: I understand that my membership plan includes a recurring fee (monthly or annual) as outlined in my selected plan. This fee covers the services described in my membership agreement, including but not limited to office visits, telehealth visits, and secure messaging as specified by my plan tier.

B. Billing Cycle: Membership fees are billed in advance on a recurring basis. Monthly members are billed on the same day each month. Annual members are billed once per year.

C. Payment Method: I agree to maintain a valid payment method on file. If my payment method declines, I will be notified and given a grace period to update my information. Continued failure to pay may result in suspension or termination of membership.

II. CANCELLATION POLICY

A. Cancellation Notice: I may cancel my membership at any time by providing written notice through the patient portal or by contacting the practice. Cancellation will be effective at the end of the current billing period.

B. Refund Policy: Monthly memberships are not refundable for partial months. Annual memberships may be refunded on a prorated basis if canceled within 30 days of renewal, minus any services already rendered.

C. Minimum Commitment: Some membership plans may include a minimum commitment period. Early termination of these plans may be subject to an early termination fee as disclosed at the time of enrollment.

III. SERVICES NOT COVERED BY MEMBERSHIP

I understand that the following services are generally NOT included in my membership fee and may incur additional charges:
   - Laboratory tests and imaging
   - Specialist referrals
   - Prescriptions and medications
   - Procedures not specified in my plan
   - Add-on services (as listed in the practice menu)
   - Supplies and materials

IV. MISSED APPOINTMENT POLICY

A. Cancellation Window: I agree to provide at least 24 hours' notice if I need to cancel or reschedule an appointment.

B. No-Show Fee: Missed appointments without adequate notice may be subject to a no-show fee of up to $50, which will be charged to my payment method on file.

C. Repeated No-Shows: Repeated missed appointments may be grounds for membership review or termination.

V. ADDITIONAL SERVICES AND ADD-ONS

I understand that certain services may be available as add-ons to my membership plan. These services are priced separately and will be clearly disclosed before I agree to them. Add-on charges will be billed to my payment method on file.

VI. INSURANCE

I understand that membership fees are generally NOT submitted to insurance. This practice may provide documentation (such as superbills) that I can submit to my insurance company for potential reimbursement, but reimbursement is not guaranteed.

VII. COLLECTIONS

In the event of unpaid balances, the practice reserves the right to pursue collection after providing reasonable notice and opportunity to pay.

VIII. ACKNOWLEDGMENT

By signing below, I acknowledge that I have read, understand, and agree to this Financial Agreement. I understand my financial responsibilities as a member of this practice.
FINANCIAL,
            ],

            // ─── Communications Consent ───
            [
                'type' => 'communications',
                'name' => 'Communications Consent',
                'specialty' => null,
                'is_required' => true,
                'version' => '1.0',
                'content' => <<<'COMMS'
COMMUNICATIONS CONSENT

I. PURPOSE

This consent authorizes this practice to communicate with you through various electronic and traditional channels for the purpose of providing healthcare services, appointment management, and practice communications.

II. COMMUNICATION CHANNELS

By signing this consent, I authorize the practice to communicate with me through the following channels:

A. Secure Patient Portal Messaging: I understand that the patient portal provides HIPAA-compliant secure messaging with my care team. I agree to use the portal as the primary method of non-urgent communication.

B. Email: I consent to receiving communications via email at the address I have provided. I understand that standard email may not be fully encrypted and that I should avoid including sensitive health information in email communications outside the secure portal.

C. Text Messages (SMS): I consent to receiving text messages for:
   - Appointment reminders and confirmations
   - Medication reminders
   - Practice announcements and notifications
   - Billing notifications
   I understand that standard text messaging is not encrypted. Clinical information will not be shared via SMS unless I specifically request it.

D. Telephone: I consent to receiving phone calls for:
   - Appointment scheduling and reminders
   - Follow-up on clinical matters
   - Billing inquiries
   - Urgent communications from my care team

E. Voicemail: I consent to the practice leaving voicemails at the phone number I have provided. I understand that voicemails may include limited information about appointments or requests to return a call.

III. HIPAA-COMPLIANT MESSAGING

I understand that:
   - The secure patient portal is the recommended method for discussing clinical matters
   - My care team will respond to portal messages within the timeframe specified by my membership plan
   - Portal messaging is not appropriate for emergencies — in an emergency, I will call 911

IV. MARKETING COMMUNICATIONS

I understand that the practice may send informational communications about:
   - New services or programs
   - Health education and wellness tips
   - Practice updates and announcements

I may opt out of non-essential marketing communications at any time without affecting my care.

V. PREFERRED CONTACT METHOD

I may specify my preferred contact method and update it at any time through the patient portal or by contacting the practice.

VI. RIGHT TO REVOKE

I may revoke this communications consent at any time by submitting a written request through the patient portal or to the practice directly. Revocation will not affect communications that occurred before the revocation.

By signing below, I acknowledge that I have read and understand this Communications Consent and authorize the practice to communicate with me through the channels described above.
COMMS,
            ],
        ];

        foreach ($templates as $template) {
            ConsentTemplate::updateOrCreate(
                ['type' => $template['type'], 'tenant_id' => null],
                [
                    'name' => $template['name'],
                    'specialty' => $template['specialty'],
                    'is_required' => $template['is_required'],
                    'version' => $template['version'],
                    'content' => $template['content'],
                    'is_active' => true,
                ]
            );
        }
    }
}
