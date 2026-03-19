// ===== MemberMD Type Definitions =====
// All shared TypeScript interfaces for the DPC membership platform

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  meta?: {
    currentPage: number;
    lastPage: number;
    perPage: number;
    total: number;
  };
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
  mfaRequired?: boolean;
  mfaToken?: string;
}

// ─── User Roles ───────────────────────────────────────────────────────────────

export type UserRole =
  | "superadmin"
  | "practice_admin"
  | "provider"
  | "staff"
  | "patient";

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  practiceId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
  status: "active" | "inactive" | "suspended";
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Practice ─────────────────────────────────────────────────────────────────

export interface Practice {
  id: string;
  name: string;
  slug: string;
  tenantCode: string;
  npi: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  timezone: string;
  status: "active" | "inactive" | "suspended";
  subscriptionTier: "starter" | "professional" | "enterprise";
  subscriptionStatus: "active" | "trialing" | "past_due" | "canceled";
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeSettings {
  id: string;
  practiceId: string;
  appointmentBufferMinutes: number;
  defaultSlotDurationMinutes: number;
  allowSameDayBooking: boolean;
  patientSelfScheduling: boolean;
  autoConfirmAppointments: boolean;
  dunningEnabled: boolean;
  dunningGraceDays: number;
  dunningMaxAttempts: number;
  labIntegrationEnabled: boolean;
  patientPortalEnabled: boolean;
  teleHealthEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeBranding {
  id: string;
  practiceId: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customCss: string | null;
  welcomeMessage: string | null;
  footerText: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface Provider {
  id: string;
  practiceId: string;
  userId: string;
  specialtyId: string | null;
  npi: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  deaNumber: string | null;
  title: string | null;
  bio: string | null;
  maxDailyPatients: number;
  acceptingNewPatients: boolean;
  teleHealthCapable: boolean;
  user?: User;
  specialty?: MasterSpecialty;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAvailability {
  id: string;
  providerId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  locationOverride: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Membership Plans ─────────────────────────────────────────────────────────

export interface MembershipPlan {
  id: string;
  practiceId: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  annualPrice: number | null;
  setupFee: number;
  maxPatients: number | null;
  visitsPerMonth: number | null;
  includesLabs: boolean;
  includesTeleHealth: boolean;
  includesUrgentCare: boolean;
  additionalBenefits: string[] | null;
  isActive: boolean;
  sortOrder: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanAddon {
  id: string;
  planId: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  isActive: boolean;
  stripePriceId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Patient ──────────────────────────────────────────────────────────────────

export interface Patient {
  id: string;
  practiceId: string;
  userId: string | null;
  primaryProviderId: string | null;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  allergies: string[] | null;
  currentMedications: string[] | null;
  chronicConditions: string[] | null;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  status: "active" | "inactive" | "pending";
  source: "direct" | "intake_form" | "referral" | "import";
  user?: User;
  primaryProvider?: Provider;
  createdAt: string;
  updatedAt: string;
}

// ─── Patient Membership ───────────────────────────────────────────────────────

export type MembershipStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "paused"
  | "pending";

export interface PatientMembership {
  id: string;
  patientId: string;
  planId: string;
  status: MembershipStatus;
  billingCycle: "monthly" | "annual";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  cancelReason: string | null;
  stripeSubscriptionId: string | null;
  plan?: MembershipPlan;
  patient?: Patient;
  createdAt: string;
  updatedAt: string;
}

// ─── Patient Entitlement ──────────────────────────────────────────────────────

export interface PatientEntitlement {
  id: string;
  membershipId: string;
  entitlementType: "visit" | "lab" | "telehealth" | "urgent_care" | "procedure";
  allowedQuantity: number | null;
  usedQuantity: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "canceled"
  | "no_show";

export interface AppointmentType {
  id: string;
  practiceId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  color: string;
  requiresMembership: boolean;
  isTeleHealth: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  practiceId: string;
  patientId: string;
  providerId: string;
  appointmentTypeId: string;
  status: AppointmentStatus;
  scheduledAt: string;
  durationMinutes: number;
  chiefComplaint: string | null;
  notes: string | null;
  isTeleHealth: boolean;
  teleHealthUrl: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  checkedInAt: string | null;
  patient?: Patient;
  provider?: Provider;
  appointmentType?: AppointmentType;
  createdAt: string;
  updatedAt: string;
}

// ─── Encounters ───────────────────────────────────────────────────────────────

export type EncounterStatus =
  | "in_progress"
  | "completed"
  | "signed"
  | "amended";

export interface Encounter {
  id: string;
  practiceId: string;
  appointmentId: string | null;
  patientId: string;
  providerId: string;
  status: EncounterStatus;
  encounterDate: string;
  chiefComplaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  vitals: Record<string, string | number> | null;
  icdCodes: string[] | null;
  cptCodes: string[] | null;
  signedAt: string | null;
  signedById: string | null;
  patient?: Patient;
  provider?: Provider;
  createdAt: string;
  updatedAt: string;
}

// ─── Prescriptions ────────────────────────────────────────────────────────────

export type PrescriptionStatus =
  | "active"
  | "completed"
  | "canceled"
  | "on_hold";

export interface Prescription {
  id: string;
  practiceId: string;
  patientId: string;
  providerId: string;
  encounterId: string | null;
  medicationName: string;
  dosage: string;
  frequency: string;
  route: string;
  quantity: number;
  refills: number;
  refillsRemaining: number;
  startDate: string;
  endDate: string | null;
  pharmacy: string | null;
  status: PrescriptionStatus;
  notes: string | null;
  patient?: Patient;
  provider?: Provider;
  createdAt: string;
  updatedAt: string;
}

// ─── Screenings ───────────────────────────────────────────────────────────────

export interface ScreeningTemplate {
  id: string;
  practiceId: string | null;
  name: string;
  description: string | null;
  category: string;
  questions: ScreeningQuestion[];
  scoringLogic: Record<string, unknown> | null;
  isSystemTemplate: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScreeningQuestion {
  id: string;
  text: string;
  type: "text" | "number" | "select" | "multi_select" | "boolean" | "scale";
  options?: string[];
  required: boolean;
}

export interface ScreeningResponse {
  id: string;
  practiceId: string;
  templateId: string;
  patientId: string;
  providerId: string | null;
  encounterId: string | null;
  answers: Record<string, unknown>;
  totalScore: number | null;
  riskLevel: "low" | "moderate" | "high" | "critical" | null;
  completedAt: string | null;
  template?: ScreeningTemplate;
  patient?: Patient;
  createdAt: string;
  updatedAt: string;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  practiceId: string;
  senderId: string;
  recipientId: string;
  parentId: string | null;
  subject: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  isUrgent: boolean;
  sender?: User;
  recipient?: User;
  createdAt: string;
  updatedAt: string;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "past_due"
  | "void"
  | "refunded";

export interface Invoice {
  id: string;
  practiceId: string;
  patientId: string;
  membershipId: string | null;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotal: number;
  tax: number;
  total: number;
  dueDate: string;
  paidAt: string | null;
  description: string | null;
  lineItems: InvoiceLineItem[];
  stripeInvoiceId: string | null;
  patient?: Patient;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | "pending"
  | "completed"
  | "failed"
  | "refunded";

export interface Payment {
  id: string;
  practiceId: string;
  invoiceId: string;
  patientId: string;
  amount: number;
  method: "card" | "ach" | "cash" | "check" | "other";
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
  processedAt: string | null;
  failureReason: string | null;
  notes: string | null;
  patient?: Patient;
  invoice?: Invoice;
  createdAt: string;
  updatedAt: string;
}

// ─── Dunning ──────────────────────────────────────────────────────────────────

export interface DunningEvent {
  id: string;
  practiceId: string;
  membershipId: string;
  eventType: "reminder_sent" | "grace_period_started" | "payment_retry" | "membership_suspended" | "membership_canceled";
  attemptNumber: number;
  notes: string | null;
  nextActionAt: string | null;
  membership?: PatientMembership;
  createdAt: string;
  updatedAt: string;
}

// ─── Consent ──────────────────────────────────────────────────────────────────

export interface ConsentTemplate {
  id: string;
  practiceId: string;
  name: string;
  content: string;
  version: string;
  isActive: boolean;
  requiresSignature: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentSignature {
  id: string;
  practiceId: string;
  templateId: string;
  patientId: string;
  signedAt: string;
  signatureData: string;
  ipAddress: string | null;
  userAgent: string | null;
  template?: ConsentTemplate;
  patient?: Patient;
  createdAt: string;
  updatedAt: string;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  practiceId: string;
  patientId: string | null;
  uploadedById: string;
  category: "lab_result" | "imaging" | "referral" | "insurance" | "consent" | "other";
  name: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  description: string | null;
  patient?: Patient;
  uploadedBy?: User;
  createdAt: string;
  updatedAt: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  practiceId: string | null;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  user?: User;
  createdAt: string;
}

// ─── Master Data ──────────────────────────────────────────────────────────────

export interface MasterSpecialty {
  id: string;
  name: string;
  code: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Coupon ───────────────────────────────────────────────────────────────────

export interface CouponCode {
  id: string;
  practiceId: string;
  code: string;
  description: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses: number | null;
  currentUses: number;
  validFrom: string | null;
  validUntil: string | null;
  applicablePlanIds: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Notification Preferences ─────────────────────────────────────────────────

export interface NotificationPreference {
  id: string;
  userId: string;
  channel: "email" | "sms" | "push" | "in_app";
  category: "appointment" | "billing" | "message" | "membership" | "system";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DashboardStats {
  totalPatients: number;
  activeMembers: number;
  monthlyRevenue: number;
  appointmentsToday: number;
  pastDueMemberships: number;
  pendingAppointments: number;
  newPatientsThisMonth: number;
  retentionRate: number;
}
