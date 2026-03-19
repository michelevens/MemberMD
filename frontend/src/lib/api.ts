// ===== MemberMD API Services =====
// All API services with mock data for development
// Pattern: apiFetch wrapper + service objects (from ShiftPulse/EnnHealth)

import type {
  User, LoginCredentials, LoginResponse,
  Practice, PracticeSettings, PracticeBranding,
  Provider, ProviderAvailability,
  MembershipPlan, PlanAddon,
  Patient, PatientMembership, PatientEntitlement,
  AppointmentType, Appointment,
  Encounter,
  Prescription,
  ScreeningTemplate, ScreeningResponse,
  Message,
  Invoice, Payment,
  DunningEvent,
  ConsentTemplate, ConsentSignature,
  Document,
  AuditLog,
  MasterSpecialty,
  CouponCode,
  NotificationPreference,
  DashboardStats,
  ApiResponse,
} from "../types";

// ===== API Configuration =====

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";
const isDemoMode = import.meta.env.VITE_DEMO_MODE !== "false";

function useMockData(): boolean {
  if (!isDemoMode) return false;
  const token = getAuthToken();
  return !token || token.startsWith("mock_token_");
}

function getCurrentPracticeId(): string {
  try {
    const user = JSON.parse(sessionStorage.getItem("membermd_user") || "{}");
    return user.practiceId || "p1";
  } catch { return "p1"; }
}

// Generic mock CUD for demo mode
function mockCreate<T>(data: Partial<T>, extraDefaults?: Partial<T>): ApiResponse<T> {
  return { data: { ...data, id: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, practiceId: getCurrentPracticeId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...extraDefaults } as T };
}
function mockUpdate<T>(data: Partial<T>): ApiResponse<T> {
  return { data: { ...data, updatedAt: new Date().toISOString() } as T };
}
function mockDelete(): ApiResponse<void> {
  return { data: undefined };
}

// ===== Token Management =====

let authToken: string | null = null;

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = sessionStorage.getItem("membermd_token");
  }
  return authToken;
}

export function setAuthToken(token: string): void {
  authToken = token;
  sessionStorage.setItem("membermd_token", token);
}

export function removeAuthToken(): void {
  authToken = null;
  sessionStorage.removeItem("membermd_token");
  sessionStorage.removeItem("membermd_user");
}

// ===== Key Transformation (snake_case <-> camelCase) =====

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function transformKeys<T>(obj: unknown, transformer: (key: string) => string): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map(item => transformKeys(item, transformer)) as T;
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[transformer(key)] = transformKeys(value, transformer);
    }
    return result as T;
  }
  return obj as T;
}

// ===== apiFetch Wrapper =====

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    let fetchOptions = { ...options, headers, credentials: "include" as RequestCredentials };
    if (options.body && typeof options.body === 'string') {
      try {
        const parsed = JSON.parse(options.body);
        fetchOptions = { ...fetchOptions, body: JSON.stringify(transformKeys(parsed, camelToSnake)) };
      } catch {
        // Not JSON, pass through
      }
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

    if (response.status === 401) {
      window.dispatchEvent(new Event("auth:unauthorized"));
      return { error: "Session expired. Please log in again." };
    }

    if (response.status === 204) {
      return { data: undefined as T };
    }

    const json = await response.json();

    if (!response.ok) {
      return { error: json.message || `Request failed (${response.status})` };
    }

    // Transform response keys to camelCase
    const data = transformKeys<T>(json.data ?? json, snakeToCamel);
    const meta = json.meta ? transformKeys<ApiResponse<T>["meta"]>(json.meta, snakeToCamel) : undefined;

    return { data, meta };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

// ===== File Upload Helper =====

async function apiUpload<T>(endpoint: string, fieldName: string, file: File): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append(fieldName, file);
  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "include",
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) return { error: json.message || "Upload failed" };
    return { data: transformKeys<T>(json.data ?? json, snakeToCamel) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

// ===== Mock Data =====

const MOCK_PRACTICE: Practice = {
  id: "p1",
  name: "Pinnacle Direct Primary Care",
  slug: "pinnacle-dpc",
  tenantCode: "A1B2C3",
  npi: "1234567890",
  taxId: "12-3456789",
  phone: "(555) 100-2000",
  email: "admin@pinnacledpc.com",
  website: "https://pinnacledpc.com",
  addressLine1: "100 Wellness Blvd",
  addressLine2: "Suite 200",
  city: "Austin",
  state: "TX",
  zip: "78701",
  timezone: "America/Chicago",
  status: "active",
  subscriptionTier: "professional",
  subscriptionStatus: "active",
  trialEndsAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  createdAt: "2025-01-15T00:00:00Z",
  updatedAt: "2026-03-18T00:00:00Z",
};

const MOCK_USER: User = {
  id: "u1",
  practiceId: "p1",
  email: "admin@pinnacledpc.com",
  firstName: "Sarah",
  lastName: "Mitchell",
  role: "practice_admin",
  phone: "(555) 100-2001",
  avatarUrl: null,
  status: "active",
  mfaEnabled: false,
  lastLoginAt: "2026-03-18T08:00:00Z",
  createdAt: "2025-01-15T00:00:00Z",
  updatedAt: "2026-03-18T00:00:00Z",
};

const MOCK_DASHBOARD: DashboardStats = {
  totalPatients: 342,
  activeMembers: 298,
  monthlyRevenue: 44700,
  appointmentsToday: 18,
  pastDueMemberships: 7,
  pendingAppointments: 12,
  newPatientsThisMonth: 14,
  retentionRate: 94.2,
};

// Demo accounts — role determined by email
const DEMO_ACCOUNTS: Record<string, { role: User["role"]; firstName: string; lastName: string }> = {
  "super@membermd.io": { role: "superadmin", firstName: "Super", lastName: "Admin" },
  "admin@pinnacledpc.com": { role: "practice_admin", firstName: "Sarah", lastName: "Mitchell" },
  "dr.michel@ennhealth.com": { role: "provider", firstName: "Nageley", lastName: "Michel" },
  "front@pinnacledpc.com": { role: "staff", firstName: "Maria", lastName: "Garcia" },
  "patient@demo.com": { role: "patient", firstName: "James", lastName: "Wilson" },
};

// ===== Service Objects =====

export const authService = {
  login: async (credentials: LoginCredentials): Promise<ApiResponse<LoginResponse>> => {
    if (useMockData()) {
      const demo = DEMO_ACCOUNTS[credentials.email] || { role: "practice_admin" as const, firstName: "Demo", lastName: "User" };
      const user: User = { ...MOCK_USER, email: credentials.email, role: demo.role, firstName: demo.firstName, lastName: demo.lastName };
      const token = `mock_token_${demo.role}_${Date.now()}`;
      sessionStorage.setItem("membermd_user", JSON.stringify(user));
      return { data: { accessToken: token, user } };
    }
    return apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },

  logout: async (): Promise<void> => {
    if (!useMockData()) {
      await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    }
    removeAuthToken();
  },

  me: async (): Promise<ApiResponse<User>> => {
    if (useMockData()) return { data: MOCK_USER };
    return apiFetch<User>("/auth/me");
  },

  mfaLogin: async (mfaToken: string, code: string): Promise<ApiResponse<LoginResponse>> => {
    return apiFetch<LoginResponse>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ mfaToken, code }),
    });
  },

  getStoredUser: (): User | null => {
    try {
      const stored = sessionStorage.getItem("membermd_user");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  },
};

export const practiceService = {
  // SuperAdmin: list all practices
  list: async (params?: { search?: string }): Promise<ApiResponse<Practice[]>> => {
    if (useMockData()) return { data: [] };
    const qs = params?.search ? `?search=${encodeURIComponent(params.search)}` : "";
    return apiFetch<Practice[]>(`/admin/practices${qs}`);
  },
  // SuperAdmin: get single practice
  getById: async (id: string): Promise<ApiResponse<Practice>> => {
    if (useMockData()) return { data: MOCK_PRACTICE };
    return apiFetch<Practice>(`/admin/practices/${id}`);
  },
  // Own practice
  get: async (): Promise<ApiResponse<Practice>> => {
    if (useMockData()) return { data: MOCK_PRACTICE };
    return apiFetch<Practice>("/practice/me");
  },
  update: async (data: Partial<Practice>): Promise<ApiResponse<Practice>> => {
    if (useMockData()) return mockUpdate<Practice>(data);
    return apiFetch<Practice>("/practice", { method: "PUT", body: JSON.stringify(data) });
  },
  getSettings: async (): Promise<ApiResponse<PracticeSettings>> => {
    if (useMockData()) return { data: {} as PracticeSettings };
    return apiFetch<PracticeSettings>("/practice/settings");
  },
  updateSettings: async (data: Partial<PracticeSettings>): Promise<ApiResponse<PracticeSettings>> => {
    if (useMockData()) return mockUpdate<PracticeSettings>(data);
    return apiFetch<PracticeSettings>("/practice/settings", { method: "PUT", body: JSON.stringify(data) });
  },
  getBranding: async (): Promise<ApiResponse<PracticeBranding>> => {
    if (useMockData()) return { data: {} as PracticeBranding };
    return apiFetch<PracticeBranding>("/practice/branding");
  },
  updateBranding: async (data: Partial<PracticeBranding>): Promise<ApiResponse<PracticeBranding>> => {
    if (useMockData()) return mockUpdate<PracticeBranding>(data);
    return apiFetch<PracticeBranding>("/practice/branding", { method: "PUT", body: JSON.stringify(data) });
  },
};

export const providerService = {
  list: async (): Promise<ApiResponse<Provider[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<Provider[]>("/providers");
  },
  getById: async (id: string): Promise<ApiResponse<Provider>> => {
    if (useMockData()) return { data: {} as Provider };
    return apiFetch<Provider>(`/providers/${id}`);
  },
  create: async (data: Partial<Provider>): Promise<ApiResponse<Provider>> => {
    if (useMockData()) return mockCreate<Provider>(data);
    return apiFetch<Provider>("/providers", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<Provider>): Promise<ApiResponse<Provider>> => {
    if (useMockData()) return mockUpdate<Provider>(data);
    return apiFetch<Provider>(`/providers/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/providers/${id}`, { method: "DELETE" });
  },
  getAvailability: async (id: string): Promise<ApiResponse<ProviderAvailability[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ProviderAvailability[]>(`/providers/${id}/availability`);
  },
  setAvailability: async (id: string, data: Partial<ProviderAvailability>[]): Promise<ApiResponse<ProviderAvailability[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ProviderAvailability[]>(`/providers/${id}/availability`, { method: "PUT", body: JSON.stringify(data) });
  },
};

export const membershipPlanService = {
  list: async (): Promise<ApiResponse<MembershipPlan[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<MembershipPlan[]>("/membership-plans");
  },
  getById: async (id: string): Promise<ApiResponse<MembershipPlan>> => {
    if (useMockData()) return { data: {} as MembershipPlan };
    return apiFetch<MembershipPlan>(`/membership-plans/${id}`);
  },
  create: async (data: Partial<MembershipPlan>): Promise<ApiResponse<MembershipPlan>> => {
    if (useMockData()) return mockCreate<MembershipPlan>(data);
    return apiFetch<MembershipPlan>("/membership-plans", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<MembershipPlan>): Promise<ApiResponse<MembershipPlan>> => {
    if (useMockData()) return mockUpdate<MembershipPlan>(data);
    return apiFetch<MembershipPlan>(`/membership-plans/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/membership-plans/${id}`, { method: "DELETE" });
  },
  getAddons: async (planId: string): Promise<ApiResponse<PlanAddon[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PlanAddon[]>(`/membership-plans/${planId}/addons`);
  },
  createAddon: async (planId: string, data: Partial<PlanAddon>): Promise<ApiResponse<PlanAddon>> => {
    if (useMockData()) return mockCreate<PlanAddon>(data);
    return apiFetch<PlanAddon>(`/membership-plans/${planId}/addons`, { method: "POST", body: JSON.stringify(data) });
  },
};

export const patientService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Patient[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Patient[]>(`/patients${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<Patient>> => {
    if (useMockData()) return { data: {} as Patient };
    return apiFetch<Patient>(`/patients/${id}`);
  },
  create: async (data: Partial<Patient>): Promise<ApiResponse<Patient>> => {
    if (useMockData()) return mockCreate<Patient>(data);
    return apiFetch<Patient>("/patients", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<Patient>): Promise<ApiResponse<Patient>> => {
    if (useMockData()) return mockUpdate<Patient>(data);
    return apiFetch<Patient>(`/patients/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/patients/${id}`, { method: "DELETE" });
  },
};

export const membershipService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<PatientMembership[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<PatientMembership[]>(`/memberships${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return { data: {} as PatientMembership };
    return apiFetch<PatientMembership>(`/memberships/${id}`);
  },
  create: async (data: Partial<PatientMembership>): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockCreate<PatientMembership>(data);
    return apiFetch<PatientMembership>("/memberships", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<PatientMembership>): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>(data);
    return apiFetch<PatientMembership>(`/memberships/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  cancel: async (id: string, reason?: string): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id, status: "canceled", cancelReason: reason });
    return apiFetch<PatientMembership>(`/memberships/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
  },
  pause: async (id: string): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id, status: "paused" });
    return apiFetch<PatientMembership>(`/memberships/${id}/pause`, { method: "POST" });
  },
  resume: async (id: string): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id, status: "active" });
    return apiFetch<PatientMembership>(`/memberships/${id}/resume`, { method: "POST" });
  },
};

export const entitlementService = {
  listForMembership: async (membershipId: string): Promise<ApiResponse<PatientEntitlement[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PatientEntitlement[]>(`/memberships/${membershipId}/entitlements`);
  },
  recordUsage: async (entitlementId: string, quantity?: number): Promise<ApiResponse<PatientEntitlement>> => {
    if (useMockData()) return mockUpdate<PatientEntitlement>({ id: entitlementId });
    return apiFetch<PatientEntitlement>(`/entitlements/${entitlementId}/usage`, { method: "POST", body: JSON.stringify({ quantity: quantity ?? 1 }) });
  },
};

export const appointmentService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Appointment[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Appointment[]>(`/appointments${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<Appointment>> => {
    if (useMockData()) return { data: {} as Appointment };
    return apiFetch<Appointment>(`/appointments/${id}`);
  },
  create: async (data: Partial<Appointment>): Promise<ApiResponse<Appointment>> => {
    if (useMockData()) return mockCreate<Appointment>(data);
    return apiFetch<Appointment>("/appointments", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<Appointment>): Promise<ApiResponse<Appointment>> => {
    if (useMockData()) return mockUpdate<Appointment>(data);
    return apiFetch<Appointment>(`/appointments/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  cancel: async (id: string, reason?: string): Promise<ApiResponse<Appointment>> => {
    if (useMockData()) return mockUpdate<Appointment>({ id, status: "canceled", cancelReason: reason });
    return apiFetch<Appointment>(`/appointments/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
  },
  checkIn: async (id: string): Promise<ApiResponse<Appointment>> => {
    if (useMockData()) return mockUpdate<Appointment>({ id, status: "checked_in" });
    return apiFetch<Appointment>(`/appointments/${id}/check-in`, { method: "POST" });
  },
  getTypes: async (): Promise<ApiResponse<AppointmentType[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<AppointmentType[]>("/appointment-types");
  },
  createType: async (data: Partial<AppointmentType>): Promise<ApiResponse<AppointmentType>> => {
    if (useMockData()) return mockCreate<AppointmentType>(data);
    return apiFetch<AppointmentType>("/appointment-types", { method: "POST", body: JSON.stringify(data) });
  },
  updateType: async (id: string, data: Partial<AppointmentType>): Promise<ApiResponse<AppointmentType>> => {
    if (useMockData()) return mockUpdate<AppointmentType>(data);
    return apiFetch<AppointmentType>(`/appointment-types/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
};

export const encounterService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Encounter[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Encounter[]>(`/encounters${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<Encounter>> => {
    if (useMockData()) return { data: {} as Encounter };
    return apiFetch<Encounter>(`/encounters/${id}`);
  },
  create: async (data: Partial<Encounter>): Promise<ApiResponse<Encounter>> => {
    if (useMockData()) return mockCreate<Encounter>(data);
    return apiFetch<Encounter>("/encounters", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<Encounter>): Promise<ApiResponse<Encounter>> => {
    if (useMockData()) return mockUpdate<Encounter>(data);
    return apiFetch<Encounter>(`/encounters/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  sign: async (id: string): Promise<ApiResponse<Encounter>> => {
    if (useMockData()) return mockUpdate<Encounter>({ id, status: "signed" });
    return apiFetch<Encounter>(`/encounters/${id}/sign`, { method: "POST" });
  },
};

export const prescriptionService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Prescription[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Prescription[]>(`/prescriptions${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<Prescription>> => {
    if (useMockData()) return { data: {} as Prescription };
    return apiFetch<Prescription>(`/prescriptions/${id}`);
  },
  create: async (data: Partial<Prescription>): Promise<ApiResponse<Prescription>> => {
    if (useMockData()) return mockCreate<Prescription>(data);
    return apiFetch<Prescription>("/prescriptions", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<Prescription>): Promise<ApiResponse<Prescription>> => {
    if (useMockData()) return mockUpdate<Prescription>(data);
    return apiFetch<Prescription>(`/prescriptions/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  cancel: async (id: string): Promise<ApiResponse<Prescription>> => {
    if (useMockData()) return mockUpdate<Prescription>({ id, status: "canceled" });
    return apiFetch<Prescription>(`/prescriptions/${id}/cancel`, { method: "POST" });
  },
};

export const screeningService = {
  listTemplates: async (): Promise<ApiResponse<ScreeningTemplate[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ScreeningTemplate[]>("/screening-templates");
  },
  createTemplate: async (data: Partial<ScreeningTemplate>): Promise<ApiResponse<ScreeningTemplate>> => {
    if (useMockData()) return mockCreate<ScreeningTemplate>(data);
    return apiFetch<ScreeningTemplate>("/screening-templates", { method: "POST", body: JSON.stringify(data) });
  },
  listResponses: async (params?: Record<string, string>): Promise<ApiResponse<ScreeningResponse[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ScreeningResponse[]>(`/screening-responses${query}`);
  },
  submitResponse: async (data: Partial<ScreeningResponse>): Promise<ApiResponse<ScreeningResponse>> => {
    if (useMockData()) return mockCreate<ScreeningResponse>(data);
    return apiFetch<ScreeningResponse>("/screening-responses", { method: "POST", body: JSON.stringify(data) });
  },
};

export const messageService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Message[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Message[]>(`/messages${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<Message>> => {
    if (useMockData()) return { data: {} as Message };
    return apiFetch<Message>(`/messages/${id}`);
  },
  send: async (data: Partial<Message>): Promise<ApiResponse<Message>> => {
    if (useMockData()) return mockCreate<Message>(data);
    return apiFetch<Message>("/messages", { method: "POST", body: JSON.stringify(data) });
  },
  markRead: async (id: string): Promise<ApiResponse<Message>> => {
    if (useMockData()) return mockUpdate<Message>({ id, isRead: true });
    return apiFetch<Message>(`/messages/${id}/read`, { method: "POST" });
  },
};

export const invoiceService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Invoice[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Invoice[]>(`/invoices${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<Invoice>> => {
    if (useMockData()) return { data: {} as Invoice };
    return apiFetch<Invoice>(`/invoices/${id}`);
  },
  create: async (data: Partial<Invoice>): Promise<ApiResponse<Invoice>> => {
    if (useMockData()) return mockCreate<Invoice>(data);
    return apiFetch<Invoice>("/invoices", { method: "POST", body: JSON.stringify(data) });
  },
  send: async (id: string): Promise<ApiResponse<Invoice>> => {
    if (useMockData()) return mockUpdate<Invoice>({ id, status: "sent" });
    return apiFetch<Invoice>(`/invoices/${id}/send`, { method: "POST" });
  },
  void: async (id: string): Promise<ApiResponse<Invoice>> => {
    if (useMockData()) return mockUpdate<Invoice>({ id, status: "void" });
    return apiFetch<Invoice>(`/invoices/${id}/void`, { method: "POST" });
  },
};

export const paymentService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Payment[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Payment[]>(`/payments${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<Payment>> => {
    if (useMockData()) return { data: {} as Payment };
    return apiFetch<Payment>(`/payments/${id}`);
  },
  create: async (data: Partial<Payment>): Promise<ApiResponse<Payment>> => {
    if (useMockData()) return mockCreate<Payment>(data);
    return apiFetch<Payment>("/payments", { method: "POST", body: JSON.stringify(data) });
  },
  refund: async (id: string, amount?: number): Promise<ApiResponse<Payment>> => {
    if (useMockData()) return mockUpdate<Payment>({ id, status: "refunded" });
    return apiFetch<Payment>(`/payments/${id}/refund`, { method: "POST", body: JSON.stringify({ amount }) });
  },
};

export const consentService = {
  listTemplates: async (): Promise<ApiResponse<ConsentTemplate[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ConsentTemplate[]>("/consent-templates");
  },
  createTemplate: async (data: Partial<ConsentTemplate>): Promise<ApiResponse<ConsentTemplate>> => {
    if (useMockData()) return mockCreate<ConsentTemplate>(data);
    return apiFetch<ConsentTemplate>("/consent-templates", { method: "POST", body: JSON.stringify(data) });
  },
  updateTemplate: async (id: string, data: Partial<ConsentTemplate>): Promise<ApiResponse<ConsentTemplate>> => {
    if (useMockData()) return mockUpdate<ConsentTemplate>(data);
    return apiFetch<ConsentTemplate>(`/consent-templates/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  listSignatures: async (patientId?: string): Promise<ApiResponse<ConsentSignature[]>> => {
    if (useMockData()) return { data: [] };
    const query = patientId ? `?patient_id=${patientId}` : "";
    return apiFetch<ConsentSignature[]>(`/consent-signatures${query}`);
  },
  sign: async (data: Partial<ConsentSignature>): Promise<ApiResponse<ConsentSignature>> => {
    if (useMockData()) return mockCreate<ConsentSignature>(data);
    return apiFetch<ConsentSignature>("/consent-signatures", { method: "POST", body: JSON.stringify(data) });
  },
};

export const documentService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Document[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Document[]>(`/documents${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<Document>> => {
    if (useMockData()) return { data: {} as Document };
    return apiFetch<Document>(`/documents/${id}`);
  },
  upload: async (file: File, data: Partial<Document>): Promise<ApiResponse<Document>> => {
    if (useMockData()) return mockCreate<Document>(data);
    return apiUpload<Document>("/documents", "file", file);
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/documents/${id}`, { method: "DELETE" });
  },
};

export const auditService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<AuditLog[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AuditLog[]>(`/audit-logs${query}`);
  },
};

export const masterDataService = {
  getSpecialties: async (): Promise<ApiResponse<MasterSpecialty[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<MasterSpecialty[]>("/master/specialties");
  },
};

export const couponService = {
  list: async (): Promise<ApiResponse<CouponCode[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<CouponCode[]>("/coupons");
  },
  create: async (data: Partial<CouponCode>): Promise<ApiResponse<CouponCode>> => {
    if (useMockData()) return mockCreate<CouponCode>(data);
    return apiFetch<CouponCode>("/coupons", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<CouponCode>): Promise<ApiResponse<CouponCode>> => {
    if (useMockData()) return mockUpdate<CouponCode>(data);
    return apiFetch<CouponCode>(`/coupons/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  validate: async (code: string, planId?: string): Promise<ApiResponse<CouponCode>> => {
    if (useMockData()) return { data: {} as CouponCode };
    return apiFetch<CouponCode>(`/coupons/validate`, { method: "POST", body: JSON.stringify({ code, planId }) });
  },
};

export const notificationService = {
  getPreferences: async (): Promise<ApiResponse<NotificationPreference[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<NotificationPreference[]>("/notification-preferences");
  },
  updatePreference: async (id: string, data: Partial<NotificationPreference>): Promise<ApiResponse<NotificationPreference>> => {
    if (useMockData()) return mockUpdate<NotificationPreference>(data);
    return apiFetch<NotificationPreference>(`/notification-preferences/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
};

export const intakeService = {
  getByTenantCode: async (tenantCode: string): Promise<ApiResponse<{ practice: Practice; plans: MembershipPlan[]; consents: ConsentTemplate[] }>> => {
    if (useMockData()) return { data: { practice: MOCK_PRACTICE, plans: [], consents: [] } };
    return apiFetch(`/intake/${tenantCode}`);
  },
  submit: async (tenantCode: string, data: Record<string, unknown>): Promise<ApiResponse<{ patientId: string; membershipId: string }>> => {
    if (useMockData()) return { data: { patientId: "mock_patient", membershipId: "mock_membership" } };
    return apiFetch(`/intake/${tenantCode}/submit`, { method: "POST", body: JSON.stringify(data) });
  },
};

export const dashboardService = {
  getStats: async (): Promise<ApiResponse<DashboardStats>> => {
    if (useMockData()) return { data: MOCK_DASHBOARD };
    return apiFetch<DashboardStats>("/admin/stats");
  },
};

export const dunningService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<DunningEvent[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<DunningEvent[]>(`/dunning-events${query}`);
  },
};
