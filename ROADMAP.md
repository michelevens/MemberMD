# MemberMD — DPC Membership Platform Roadmap

> Version: 1.0 | Created: March 20, 2026
> Goal: Match and exceed Hint Health, Atlas.md, and Elation Health
> Stack: React + TypeScript + Vite + Tailwind | Laravel 12 + PostgreSQL

---

## Current State

### What MemberMD Already Has
- **Auth**: Login, register, Sanctum tokens, MFA, roles (superadmin, practice_admin, provider, staff, patient)
- **Patients**: Full CRUD, family members, emergency contacts, encrypted PHI
- **Appointments**: CRUD, available slots, reschedule, waitlist, calendar links (iCal, Google)
- **Encounters**: SOAP notes, vitals, diagnoses, labs_ordered, sign/amend
- **Prescriptions**: CRUD, PDF generation, eFax, refill request/process
- **Membership Plans**: Configurable (monthly/annual, visit limits, telehealth, messaging SLA, lab discounts)
- **Memberships**: Enrollment, Stripe subscriptions, pause/cancel, entitlements, visit recording
- **Billing**: Invoices (PDF), payments (refund), coupons
- **Telehealth**: Daily.co (create, join, end, consent)
- **Messaging**: Thread-based, unread counts
- **Documents**: Upload/download
- **Screenings**: Templates + responses (PHQ-9, etc.)
- **Programs**: Full program management (enrollment, providers, eligibility, funding)
- **Notifications**: List, unread count, mark-read
- **Audit/HIPAA**: Audit logs, PHI access logs, security events, HIPAA checklist
- **Calendar**: iCal feed, Google Calendar
- **External/Public**: Basic enrollment endpoint, plan listing, availability check
- **Frontend**: PatientPortal, PracticePortal, SuperAdminPortal, EnrollmentWidget

### Competitive Gap Analysis

| Feature | Hint Health | Atlas.md | Elation | MemberMD |
|---------|------------|----------|---------|----------|
| Employer contracts/portal | **Yes** | No | No | No |
| E-prescribing (Surescripts) | No | **Yes** | **Yes** | No (PDF/eFax) |
| Lab ordering (Quest/LabCorp) | No | **Yes** | **Yes** | No |
| Two-way SMS messaging | No | **Yes** | No | No |
| Structured charting templates | No | Basic | **Yes** | No (free-text SOAP) |
| Patient check-in kiosk | No | **Yes** | No | No |
| Medication dispensing | No | **Yes** | No | No |
| Revenue analytics | Basic | Basic | No | No |
| Automated dunning | **Yes** | Basic | No | Partial (model only) |
| Referral management | No | Basic | **Yes** | No |
| Embeddable widgets (advanced) | **Yes** | No | No | Basic |
| Patient engagement scoring | No | No | No | No |
| Care coordination dashboard | No | No | No | No |
| Wellness programs | No | No | No | **Yes** |
| Screening tools | No | No | Built-in | **Yes** |
| Waitlist | No | No | No | **Yes** |

---

## Phase 1: Match Competitors (Weeks 1–10)

Close feature gaps that would cause practices to choose a competitor over MemberMD.

---

### 1.1 Two-Way SMS Messaging
**Why**: Atlas.md's two-way texting is a major patient engagement advantage.

**Spec**:
- Twilio integration for inbound/outbound SMS
- SMS appears in existing message thread alongside portal messages
- Auto-route inbound texts to patient by phone number
- Opt-in/opt-out (TCPA compliance)
- Automated appointment reminders via SMS

**Backend**: Extend `Message` model (add `channel`, `external_id`, `delivery_status`), new `TwilioSmsService`, `SmsWebhookController`, `sms_opt_ins` table
**Frontend**: Channel indicator in threads, SMS compose option, reminder settings
**Integration**: Twilio Programmable SMS
**Complexity**: M

---

### 1.2 Revenue Analytics & Reporting
**Why**: Both Hint and Atlas offer revenue reporting. Practices need MRR, churn, ARPM visibility.

**Spec**:
- Dashboard widgets: MRR, ARR, churn rate, ARPM, lifetime value
- Membership analytics: enrollments, cancellations, plan distribution, growth trends
- Financial reports: revenue by plan, by provider, by month
- Patient panel: capacity utilization, visit frequency
- Export CSV/PDF

**Backend**: New `ReportController`, `AnalyticsService`, `report_snapshots` table
**Frontend**: `RevenueAnalytics.tsx`, `MembershipAnalytics.tsx`, `ProviderAnalytics.tsx` (Recharts)
**Complexity**: M

---

### 1.3 Automated Dunning & Payment Recovery
**Why**: Hint's automated dunning is a key feature. MemberMD has DunningEvent model but no automation.

**Spec**:
- Configurable dunning sequence (Day 1: email, Day 3: SMS, Day 7: email, Day 14: pause, Day 30: cancel)
- Stripe webhook for payment_intent.payment_failed
- Dashboard: patients in dunning, recovery rate
- Patient self-service card update

**Backend**: New `DunningPolicy` model, extend `DunningEvent`, `DunningService`, scheduled `ProcessDunning` command
**Frontend**: `DunningPolicySettings.tsx`, `DunningDashboard.tsx`, `UpdatePaymentMethod.tsx`
**Integration**: Stripe webhooks, Stripe Customer Portal
**Complexity**: M

---

### 1.4 Patient Check-In Kiosk
**Why**: Atlas.md has this. Eliminates front desk friction.

**Spec**:
- Full-screen kiosk mode: PIN, DOB+last name, or QR code check-in
- On check-in: update demographics, sign consents, complete screenings
- Provider notified of arrival
- Tablet-optimized layout

**Backend**: New `KioskController`, extend `Appointment` (add `checked_in_at`, `check_in_method`)
**Frontend**: `KioskMode.tsx`, QR code display on patient portal
**Port from ShiftPulse**: Clock-in kiosk pattern (`ClockInWidget.tsx` flow, `ExternalClockController` PIN validation)
**Complexity**: M

---

### 1.5 Referral Management
**Why**: Elation has referral tracking. DPC practices frequently refer to specialists.

**Spec**:
- Referral lifecycle: created → sent (fax/email) → acknowledged → completed
- Specialist directory (practice-maintained)
- Attach referral reports to patient chart
- Track turnaround time

**Backend**: New `Referral`, `SpecialistDirectory` models, `ReferralController`
**Frontend**: `ReferralForm.tsx`, `ReferralTracker.tsx`, `SpecialistDirectoryManager.tsx`
**Integration**: eFax (already used for prescriptions)
**Complexity**: M

---

### 1.6 Structured Charting Templates
**Why**: Elation's structured charting is its differentiator. Free-text SOAP is insufficient.

**Spec**:
- ChartTemplate model with structured fields (checkboxes, dropdowns, text, numeric)
- Template builder for practice_admin/provider
- Template library: wellness, acute, chronic, procedure visit types
- Auto-populate previous values for follow-ups
- ICD-10/CPT code suggestions from structured data

**Backend**: New `ChartTemplate`, `ChartTemplateField`, `ChartTemplateResponse` models, extend `Encounter` (add `template_id`, `structured_data`)
**Frontend**: `ChartTemplateBuilder.tsx` (drag-and-drop), `StructuredEncounterForm.tsx`
**Complexity**: L

---

### 1.7 Lab Ordering Integration
**Why**: Atlas.md and Elation both offer integrated lab ordering. Table stakes.

**Spec**:
- LabOrder model linked to patient + encounter
- Quest Quanum and/or LabCorp API for electronic ordering
- Results webhook to receive lab results
- Structured results viewer with normal/abnormal flagging
- Patient portal: view own lab results

**Backend**: New `LabOrder`, `LabResult` models, `LabOrderController`, webhook endpoint
**Frontend**: `LabOrderPanel.tsx` in encounter, `LabResultsViewer.tsx`
**Integration**: Quest Quanum API, LabCorp Beacon API (or manual fax fallback initially)
**Complexity**: L

---

### 1.8 Employer Contracts & Portal
**Why**: Hint Health's #1 differentiator. Employer-sponsored DPC is the fastest-growing segment.

**Spec**:
- Employer model: company info, contract terms, PEPM pricing, employee cap
- EmployerPortal: new portal for HR contacts (Dashboard, Employees, Invoices, Reports)
- HR roster upload (CSV) → employees get enrollment links
- Monthly employer invoicing based on enrolled headcount
- De-identified utilization reports for employers

**Backend**: New `Employer`, `EmployerContract`, `EmployerEmployee`, `EmployerInvoice` models, new role `employer_admin`, extend `Patient` (add `employer_id`)
**Frontend**: `EmployerPortal.tsx`, `EmployerRosterUpload.tsx`, `EmployerContractManager.tsx`
**Integration**: Stripe (employer invoicing)
**Complexity**: L

---

### 1.9 E-Prescribing (Surescripts)
**Why**: PDF/eFax is not competitive. State mandates require electronic prescribing.

**Spec**:
- Surescripts NCPDP SCRIPT integration (NewRx, RefillRequest, RxChange)
- EPCS for controlled substances (identity proofing + 2FA per DEA)
- Medication history lookup
- Drug interaction checking
- Pharmacy directory search

**Backend**: New `SurescriptsService`, `PharmacyDirectory` model, extend `Prescription` (add `surescripts_message_id`, `epcs_token`)
**Frontend**: Enhanced prescription form with pharmacy search, drug interaction alerts, EPCS 2FA flow
**Integration**: Surescripts via certified intermediary (DoseSpot, DrFirst, or RCopia)
**Complexity**: L (12+ month certification if direct; faster via intermediary)

---

## Phase 2: Exceed Competitors (Weeks 11–18)

Features no single competitor offers today — genuine differentiators.

---

### 2.1 Embeddable Widget System (Advanced)
**Why**: Hint has basic enrollment widgets. MemberMD can offer a full configurable, brandable widget platform.

**Spec**:
- Widget types: enrollment, plan comparison, appointment booking, contact form
- Practice admins configure branding (colors, logo, custom fields)
- `widget-loader.js` for embedding on practice websites
- Widget analytics: impressions, starts, completions, conversion rate

**Backend**: New `WidgetConfig`, `WidgetSubmission` models, `WidgetConfigController`, `WidgetPageController`, blade template, `widget-loader.js`
**Frontend**: `WidgetConfigManager.tsx`, `WidgetPreview.tsx`, `WidgetAnalytics.tsx`
**Port from ShiftPulse**:
- `app/Models/WidgetConfig.php` → change Tenant → Practice
- `public/widget-loader.js` → change base URL
- `app/Http/Controllers/Api/WidgetPageController.php` → change Tenant → Practice lookup
- `resources/views/widget.blade.php` → adapt for enrollment/booking forms
**Complexity**: M

---

### 2.2 Unified Communication Hub (Omnichannel)
**Why**: No competitor unifies portal + SMS + email + telehealth in one timeline.

**Spec**:
- Single patient communication timeline across all channels
- Smart routing: urgent auto-escalation, after-hours auto-reply
- Communication SLA tracking (per membership plan response time)
- Patient channel preferences

**Backend**: New `CommunicationLog` model, extend `Message` (add `priority`, `sla_deadline`), `CommunicationRouter` service
**Frontend**: `UnifiedInbox.tsx`, `CommunicationTimeline.tsx`, `SlaTracker.tsx`
**Complexity**: L | **Depends on**: Phase 1.1 (SMS)

---

### 2.3 Patient Engagement Scoring & Automation
**Why**: No competitor tracks patient engagement. Practices lose patients who disengage silently.

**Spec**:
- Engagement score: visit frequency vs. entitlement, message responsiveness, screening completion, portal logins, no-show rate
- Automated outreach triggers: "No visit in 60 days" → auto-message
- At-risk patient dashboard
- Configurable engagement rules

**Backend**: New `PatientEngagement`, `EngagementRule` models, `EngagementScoringService`, scheduled `CalculateEngagementScores` command
**Frontend**: `EngagementDashboard.tsx`, `PatientEngagementCard.tsx`, `EngagementRuleBuilder.tsx`
**Complexity**: M

---

### 2.4 Care Coordination Dashboard
**Why**: DPC's value is coordinated care. No competitor offers a true care coordination view.

**Spec**:
- Per-patient: open referrals, pending labs, overdue screenings, medication reconciliation, care gaps
- Population health: patients overdue for preventive care, chronic disease registries
- Care gap alerts: automated USPSTF guideline evaluation
- Chronic disease tracking: A1C trends, BP trends, PHQ-9 trends

**Backend**: New `CareGap` model, `CareGapService` (USPSTF evaluation), `CareCoordinationController`
**Frontend**: `CareCoordinationDashboard.tsx`, `PatientCarePanel.tsx`, `PopulationHealthView.tsx`
**Complexity**: L | **Depends on**: Labs (1.7), referrals (1.5), screenings

---

### 2.5 Inventory & Dispensing Tracker
**Why**: Atlas.md supports in-office dispensing. Many DPC practices dispense common medications.

**Spec**:
- Inventory: medication/supply, NDC, quantity, reorder point, cost, lot, expiration
- Dispense from encounter, auto-deduct inventory
- Reorder alerts, cost tracking, dispensing revenue reports

**Backend**: New `InventoryItem`, `DispenseRecord` models, `InventoryController`
**Frontend**: `InventoryManager.tsx`, `DispenseForm.tsx`, `ReorderAlerts.tsx`
**Complexity**: M

---

### 2.6 Outcome Tracking & Value Reporting
**Why**: No competitor offers this. DPC practices need to prove value with data.

**Spec**:
- Per-patient health metrics over time (weight, BP, A1C, cholesterol, PHQ-9)
- Value reports: cost savings estimates (ER avoidance, specialist reduction)
- Employer value reports (aggregate, de-identified)
- Patient-facing health journey summary

**Backend**: New `HealthMetric`, `ValueReport` models, `OutcomeController`, `ValueCalculationService`
**Frontend**: `OutcomeTracker.tsx`, `ValueReportGenerator.tsx`, `EmployerValueReport.tsx`
**Complexity**: M | **Depends on**: Employer portal (1.8), encounters, labs (1.7)

---

## Phase 3: Cross-Pollinate from ShiftPulse (Weeks 19–24)

Port proven patterns from ShiftPulse to accelerate development.

---

### 3.1 Broadcast Messaging
**Spec**: Mass messages to all patients or filtered by plan/provider. Channels: in-app + email + SMS.

**Port from ShiftPulse**: `BroadcastController.php` → change role filtering to plan-based audience targeting
**Backend**: New `BroadcastMessage` model, `BroadcastController`
**Frontend**: `BroadcastComposer.tsx`, `BroadcastHistory.tsx`
**Complexity**: S

---

### 3.2 Provider Credential Tracking
**Spec**: Track licenses, DEA, board certs, malpractice with expiration alerts and compliance scoring.

**Port from ShiftPulse**: `CredentialController.php` → change `staff_id` to `provider_id`; `CredentialComplianceService` for scoring
**Backend**: New `ProviderCredential` model, `ProviderCredentialController`, scheduled `CheckCredentialExpiration`
**Frontend**: `ProviderCredentials.tsx`, `CredentialAlerts.tsx`, `CredentialComplianceScore.tsx`
**Complexity**: M

---

### 3.3 HIPAA Compliance Scoring Dashboard
**Spec**: Compliance requirements library, per-practice scoring, review history, printable audit report.

**Port from ShiftPulse**: `ComplianceController.php` → scoring algorithm (weighted: compliant=100, partial=50), critical issues identification, audit logging pattern
**Backend**: New `ComplianceRequirement`, `ComplianceRecord`, `ComplianceScoreSnapshot` models
**Frontend**: `HipaaComplianceDashboard.tsx`, `ComplianceRecordForm.tsx`, `ComplianceReport.tsx`
**Complexity**: M

---

### 3.4 Incident / Safety Event Reporting
**Spec**: Adverse events, near-misses, patient complaints. Review workflow with notifications.

**Port from ShiftPulse**: `IncidentController.php` → change `client_id` to `patient_id`, change role checks to DPC roles
**Backend**: New `Incident` model, `IncidentController`
**Frontend**: `IncidentReportForm.tsx`, `IncidentDashboard.tsx`, `IncidentReview.tsx`
**Complexity**: S

---

### 3.5 Granular Notification Preferences
**Spec**: Per-category (appointments, messages, billing, labs, prescriptions) × per-channel (in-app, email, SMS) matrix.

**Port from ShiftPulse**: Notification preferences pattern from AgencyPortal Settings
**Backend**: Extend `NotificationPreference`, new `NotificationDispatcher` service
**Frontend**: `NotificationPreferences.tsx` (category × channel toggle matrix)
**Complexity**: S

---

### 3.6 Signature Capture Component
**Spec**: Reusable draw/type signature for consents, treatment authorizations, telehealth consents.

**Port from ShiftPulse**: Canvas signature pattern from Daily Care Reports (touch support, typed alternative, PNG export)
**Backend**: Extend `ConsentSignature` (add `signature_image_url`, `ip_address`, `method`), new `ConsentFormTemplate`
**Frontend**: `SignatureCapture.tsx` (reusable), `ConsentFormBuilder.tsx`, `ConsentSigner.tsx`
**Complexity**: S

---

## Implementation Sequence

```
Weeks 1-2:   1.1 SMS Messaging | 1.2 Revenue Analytics | 1.3 Dunning Automation
Weeks 3-4:   1.4 Check-In Kiosk | 1.5 Referral Management
Weeks 5-7:   1.6 Chart Templates | 1.7 Lab Ordering (parallel)
Weeks 8-10:  1.8 Employer Portal | 1.9 E-Prescribing (begin integration)
Weeks 11-13: 2.1 Widget System | 2.2 Unified Comms | 2.3 Engagement Scoring
Weeks 14-16: 2.4 Care Coordination | 2.5 Inventory/Dispensing
Weeks 17-18: 2.6 Outcome Tracking
Weeks 19-20: 3.1 Broadcasts | 3.4 Incidents | 3.5 Notification Prefs | 3.6 Signatures
Weeks 21-23: 3.2 Provider Credentials | 3.3 HIPAA Compliance Scoring
Week 24:     Integration testing, polish, documentation
```

---

## New Models Summary

| Phase | Models |
|-------|--------|
| 1 | LabOrder, LabResult, PharmacyDirectory, ChartTemplate, ChartTemplateField, ChartTemplateResponse, Employer, EmployerContract, EmployerEmployee, EmployerInvoice, SmsOptIn, DunningPolicy, Referral, SpecialistDirectory |
| 2 | CommunicationLog, CareGap, PatientEngagement, EngagementRule, InventoryItem, DispenseRecord, WidgetConfig, WidgetSubmission, HealthMetric, ValueReport |
| 3 | BroadcastMessage, ProviderCredential, ComplianceRequirement, ComplianceRecord, ComplianceScoreSnapshot, Incident, ConsentFormTemplate |

---

## Third-Party Integrations

| Integration | Feature | Phase | Cost |
|-------------|---------|-------|------|
| Twilio SMS | Two-way texting | 1 | Per-message |
| Quest Quanum API | Lab ordering | 1 | Per-order |
| LabCorp Beacon API | Lab ordering | 1 | Per-order |
| Surescripts (via DoseSpot/DrFirst) | E-prescribing, EPCS | 1 | Per-transaction |
| Stripe (extended) | Employer invoicing, dunning | 1 | Existing |
| Recharts | Analytics charts | 1 | Free/OSS |

---

## ShiftPulse Code Reuse Map

| ShiftPulse File | MemberMD Feature | Adaptation |
|----------------|-------------------|------------|
| `WidgetConfig.php` | 2.1 Widget System | Tenant → Practice |
| `widget-loader.js` | 2.1 Widget System | Change base URL |
| `WidgetPageController.php` | 2.1 Widget System | Tenant → Practice lookup |
| `widget.blade.php` | 2.1 Widget System | Adapt for enrollment/booking |
| `BroadcastController.php` | 3.1 Broadcasts | Role filtering → plan-based audience |
| `CredentialController.php` | 3.2 Credentials | staff_id → provider_id |
| `CredentialComplianceService.php` | 3.2 Credentials | Adapt credential types |
| `ComplianceController.php` | 3.3 HIPAA Compliance | Port scoring algorithm, practice scope |
| `IncidentController.php` | 3.4 Incidents | client_id → patient_id, DPC roles |
| `NotificationController.php` | 3.5 Notification Prefs | DPC notification categories |
| `ClockInWidget.tsx` (pattern) | 1.4 Kiosk | Adapt for appointment check-in |
| Daily Care Report signature (pattern) | 3.6 Signatures | Port canvas component to React |

---

## MemberMD Advantages to Protect

These existing features are unique — no competitor has them. Double down:

1. **Wellness Programs** — structured program management with enrollment, eligibility rules, funding sources
2. **Screening Tools** — built-in PHQ-9, GAD-7, etc. with templated responses
3. **Waitlist Management** — automated waitlist with notification
4. **Modern Stack** — React + Laravel vs legacy competitors
5. **Multi-tenant from day one** — ready for white-label/franchise from the start
6. **HIPAA Audit Trail** — PHI access logging, security events, compliance dashboard
