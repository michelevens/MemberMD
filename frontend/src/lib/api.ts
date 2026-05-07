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
  Program,
  ProgramEnrollment,
  ProgramProvider,
  ApiResponse,
  AvailableSlot,
  CalendarLinks,
  TelehealthSession,
  PhiAccessLog,
  SecurityEvent,
  ComplianceDashboardData,
  HipaaChecklistItem,
  EngagementCampaign,
  PatientEngagementScore,
  EngagementAnalyticsSummary,
  ProviderRevenueMetrics,
  ProviderPatientPanel,
  ProviderSummaryItem,
  PracticePerformanceMetrics,
} from "../types";

// ===== API Configuration =====

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";
const isDemoMode = import.meta.env.VITE_DEMO_MODE !== "false";

function useMockData(): boolean {
  if (!isDemoMode) return false;
  const token = getAuthToken();
  return !token || token.startsWith("mock_token_");
}

/**
 * Public version of useMockData() for use by components. UI code MUST gate
 * mock-data fallbacks behind this — without it, real users with empty data
 * see another fictional patient's PHI on their dashboard (audit B6).
 */
export function isUsingMockData(): boolean {
  return useMockData();
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
  sessionStorage.removeItem("membermd_operator_id");
  sessionStorage.removeItem("membermd_active_tenant_id");
}

// ===== Operator scope (for multi-practice operators) =====
// Stored client-side and sent on every request as headers so the backend's
// OperatorScope middleware can resolve the right scope.

export function getActiveOperatorId(): string | null {
  return sessionStorage.getItem("membermd_operator_id");
}

export function setActiveOperatorId(id: string | null): void {
  if (id) {
    sessionStorage.setItem("membermd_operator_id", id);
  } else {
    sessionStorage.removeItem("membermd_operator_id");
  }
}

export function getActiveTenantId(): string | null {
  return sessionStorage.getItem("membermd_active_tenant_id");
}

export function setActiveTenantId(id: string | null): void {
  if (id) {
    sessionStorage.setItem("membermd_active_tenant_id", id);
  } else {
    sessionStorage.removeItem("membermd_active_tenant_id");
  }
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

export async function apiFetch<T>(
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

  // Operator scope headers — read by App\Http\Middleware\ResolveOperatorScope
  const operatorId = getActiveOperatorId();
  if (operatorId) {
    headers["X-Operator-Id"] = operatorId;
  }
  const activeTenantId = getActiveTenantId();
  if (activeTenantId) {
    headers["X-Active-Tenant-Id"] = activeTenantId;
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
      // 402 from EnforcePlanCap middleware — broadcast a structured event so
      // the SPA can show a global "Upgrade plan" modal regardless of which
      // create-screen triggered the cap. Also returns the standard error so
      // the calling component can fall back to its own error toast if needed.
      if (response.status === 402 && (json.error_code === "plan_cap_reached" || json.errorCode === "plan_cap_reached")) {
        const cap = transformKeys(json.cap ?? {}, snakeToCamel);
        window.dispatchEvent(new CustomEvent("plan:cap-reached", { detail: { cap, message: json.message } }));
      }
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

export async function apiUpload<T>(endpoint: string, fieldName: string, file: File): Promise<ApiResponse<T>> {
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

  register: async (data: { email: string; password: string; firstName: string; lastName: string; practiceName?: string }): Promise<ApiResponse<LoginResponse>> => {
    if (useMockData()) {
      const user: User = { ...MOCK_USER, email: data.email, firstName: data.firstName, lastName: data.lastName };
      return { data: { accessToken: `mock_token_practice_admin_${Date.now()}`, user } };
    }
    return apiFetch<LoginResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
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

  updateProfile: async (data: Partial<User>): Promise<ApiResponse<User>> => {
    if (useMockData()) return mockUpdate<User>(data);
    return apiFetch<User>("/auth/profile", { method: "PUT", body: JSON.stringify(data) });
  },

  mfaLogin: async (mfaToken: string, code: string): Promise<ApiResponse<LoginResponse>> => {
    return apiFetch<LoginResponse>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ mfaToken, code }),
    });
  },

  changePassword: async (data: { currentPassword: string; newPassword: string; newPasswordConfirmation: string }): Promise<ApiResponse<{ message: string }>> => {
    if (useMockData()) return { data: { message: "Password changed" } };
    return apiFetch<{ message: string }>("/auth/password", { method: "PUT", body: JSON.stringify(data) });
  },

  setupMfa: async (): Promise<ApiResponse<{ secret: string; qrCodeUrl: string; otpauthUrl: string }>> => {
    if (useMockData()) return { data: { secret: "JBSWY3DPEHPK3PXP", qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=demo", otpauthUrl: "otpauth://totp/MemberMD?secret=JBSWY3DPEHPK3PXP" } };
    return apiFetch<{ secret: string; qrCodeUrl: string; otpauthUrl: string }>("/auth/mfa/setup", { method: "POST" });
  },

  enableMfa: async (data: { code: string; secret: string }): Promise<ApiResponse<{ enabled: boolean; backupCodes: string[] }>> => {
    if (useMockData()) return { data: { enabled: true, backupCodes: ["AAAA-BBBB", "CCCC-DDDD", "EEEE-FFFF", "GGGG-HHHH"] } };
    return apiFetch<{ enabled: boolean; backupCodes: string[] }>("/auth/mfa/enable", { method: "POST", body: JSON.stringify(data) });
  },

  disableMfa: async (data: { password: string }): Promise<ApiResponse<{ disabled: boolean }>> => {
    if (useMockData()) return { data: { disabled: true } };
    return apiFetch<{ disabled: boolean }>("/auth/mfa/disable", { method: "POST", body: JSON.stringify(data) });
  },

  getStoredUser: (): User | null => {
    try {
      const stored = sessionStorage.getItem("membermd_user");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  },
};

// ===== Clinical Lookup Service (NPI, RxNorm, ICD-10) =====

export const clinicalLookupService = {
  searchNPI: async (query: string, state?: string): Promise<ApiResponse<Record<string, unknown>[]>> => {
    const params = new URLSearchParams({ q: query });
    if (state) params.set("state", state);
    if (useMockData()) return { data: [
      { npi: "1234567890", name: "Dr. Jane Smith, MD", credentials: "MD", specialty: "Internal Medicine", address: "123 Medical Dr, New York, NY 10001", phone: "(555) 123-4567", state: "NY", enumerationType: "Individual" },
      { npi: "0987654321", name: "Dr. John Doe, DO", credentials: "DO", specialty: "Family Medicine", address: "456 Health Ave, Los Angeles, CA 90001", phone: "(555) 987-6543", state: "CA", enumerationType: "Individual" },
    ] };
    return apiFetch<Record<string, unknown>[]>(`/clinical-lookup/npi?${params}`);
  },
  searchNPIByNumber: async (npi: string): Promise<ApiResponse<Record<string, unknown>[]>> => {
    if (useMockData()) return { data: [{ npi, name: "Dr. Demo Provider, MD", credentials: "MD", specialty: "Internal Medicine", address: "123 Demo St", phone: "(555) 000-0000", state: "NY", enumerationType: "Individual" }] };
    return apiFetch<Record<string, unknown>[]>(`/clinical-lookup/npi?npi=${npi}`);
  },
  searchDrugs: async (query: string): Promise<ApiResponse<Record<string, unknown>[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<Record<string, unknown>[]>(`/clinical-lookup/drugs?q=${encodeURIComponent(query)}`);
  },
  searchICD10: async (query: string): Promise<ApiResponse<Record<string, unknown>[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<Record<string, unknown>[]>(`/clinical-lookup/icd10?q=${encodeURIComponent(query)}`);
  },
  drugInteractions: async (rxcui: string): Promise<ApiResponse<Record<string, unknown>[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<Record<string, unknown>[]>(`/clinical-lookup/drug-interactions?rxcui=${rxcui}`);
  },
};

// ─── Admin (SuperAdmin only) ────────────────────────────────────────────────

export const adminService = {
  // Practice management
  listPractices: async (params?: { search?: string }): Promise<ApiResponse<Practice[]>> => {
    if (useMockData()) return { data: [] };
    const qs = params?.search ? `?search=${encodeURIComponent(params.search)}` : "";
    return apiFetch<Practice[]>(`/admin/practices${qs}`);
  },
  /**
   * SuperAdmin practice detail. Returns a richer payload than the list:
   *   { practice, plans, members, providers, activity }
   * The detail page uses this single fetch to render every section
   * with real tenant data instead of mocks.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPractice: async (id: string): Promise<ApiResponse<any>> => {
    if (useMockData()) return { data: { practice: MOCK_PRACTICE, plans: [], members: [], providers: [], activity: [] } };
    return apiFetch<unknown>(`/admin/practices/${id}`);
  },
  getStats: async (): Promise<ApiResponse<DashboardStats>> => {
    if (useMockData()) return { data: MOCK_DASHBOARD };
    return apiFetch<DashboardStats>("/admin/stats");
  },
  // Master data
  getSpecialties: async (): Promise<ApiResponse<MasterSpecialty[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<MasterSpecialty[]>("/admin/master-data/specialties");
  },
  getSpecialty: async (id: string): Promise<ApiResponse<MasterSpecialty>> => {
    if (useMockData()) return { data: {} as MasterSpecialty };
    return apiFetch<MasterSpecialty>(`/admin/master-data/specialties/${id}`);
  },
  getScreenings: async (): Promise<ApiResponse<ScreeningTemplate[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ScreeningTemplate[]>("/admin/master-data/screenings");
  },
  getConsents: async (): Promise<ApiResponse<ConsentTemplate[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ConsentTemplate[]>("/admin/master-data/consents");
  },
  getMasterDataStats: async (): Promise<ApiResponse<Record<string, number>>> => {
    if (useMockData()) return { data: {} };
    return apiFetch<Record<string, number>>("/admin/master-data/stats");
  },
};

// ─── Practice ───────────────────────────────────────────────────────────────

export const practiceService = {
  // SuperAdmin: list all practices (delegates to adminService)
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
    return apiFetch<Practice>("/practice/me", { method: "PUT", body: JSON.stringify(data) });
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

// ─── Providers ──────────────────────────────────────────────────────────────

/**
 * Translate the camelCase form payload to the snake_case shape the backend's
 * StoreProviderRequest validator expects. Specialty is a string in the UI
 * but the backend stores `specialties` as an array; wrap it.
 */
function toProviderApiPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.firstName !== undefined) out.first_name = input.firstName;
  if (input.lastName !== undefined) out.last_name = input.lastName;
  if (input.email !== undefined) out.email = input.email;
  if (input.phone !== undefined) out.phone = input.phone;
  if (input.credentials !== undefined) out.credentials = input.credentials;
  if (input.bio !== undefined) out.bio = input.bio;
  if (input.npiNumber !== undefined) out.npi = input.npiNumber;
  if (input.licenseNumber !== undefined) out.license_number = input.licenseNumber;
  if (input.licenseState !== undefined) out.license_state = input.licenseState;
  if (input.title !== undefined) out.title = input.title;
  if (input.panelCapacity !== undefined) out.panel_capacity = input.panelCapacity;
  if (input.panelStatus !== undefined) out.panel_status = input.panelStatus;
  if (input.acceptsNewPatients !== undefined) out.accepts_new_patients = input.acceptsNewPatients;
  if (input.telehealth !== undefined) out.telehealth_enabled = input.telehealth;
  if (input.telehealthEnabled !== undefined) out.telehealth_enabled = input.telehealthEnabled;
  if (input.consultationFee !== undefined) out.consultation_fee = input.consultationFee;
  if (input.specialty !== undefined && input.specialty !== "") {
    out.specialties = [input.specialty];
  }
  if (Array.isArray(input.specialties)) out.specialties = input.specialties;
  if (Array.isArray(input.languages)) out.languages = input.languages;
  if (Array.isArray(input.licensedStates)) out.licensed_states = input.licensedStates;
  if (input.timezone !== undefined) {
    // Empty string in the picker means "fall back to practice tz" — send
    // null so the backend column resets to nullable.
    out.timezone = input.timezone === "" ? null : input.timezone;
  }
  return out;
}

// ─── Staff (separate from Providers — gated by plan.cap:staff) ─────────────

export interface StaffRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "staff" | "practice_admin";
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export const staffService = {
  list: async (): Promise<ApiResponse<StaffRow[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<StaffRow[]>("/practice/staff");
  },
  invite: async (data: { firstName: string; lastName: string; email: string; role?: "staff" | "practice_admin"; phone?: string }): Promise<ApiResponse<StaffRow>> => {
    if (useMockData()) return { data: null as unknown as StaffRow };
    return apiFetch<StaffRow>("/practice/staff", {
      method: "POST",
      body: JSON.stringify(data),
    });
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
  create: async (data: Record<string, unknown>): Promise<ApiResponse<Provider>> => {
    if (useMockData()) return mockCreate<Provider>(data as Partial<Provider>);
    return apiFetch<Provider>("/providers", { method: "POST", body: JSON.stringify(toProviderApiPayload(data)) });
  },
  update: async (id: string, data: Record<string, unknown>): Promise<ApiResponse<Provider>> => {
    if (useMockData()) return mockUpdate<Provider>(data as Partial<Provider>);
    return apiFetch<Provider>(`/providers/${id}`, { method: "PUT", body: JSON.stringify(toProviderApiPayload(data)) });
  },
  getAvailability: async (id: string): Promise<ApiResponse<ProviderAvailability[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ProviderAvailability[]>(`/providers/${id}/availability`);
  },
  setAvailability: async (id: string, slots: Partial<ProviderAvailability>[]): Promise<ApiResponse<ProviderAvailability[]>> => {
    if (useMockData()) return { data: [] };
    // Backend expects { availability: [{ day_of_week, start_time, end_time, is_available }] }
    const availability = slots.map(s => ({
      day_of_week: s.dayOfWeek,
      start_time: s.startTime,
      end_time: s.endTime,
      is_available: s.isAvailable ?? true,
      location: s.locationOverride ?? null,
    }));
    return apiFetch<ProviderAvailability[]>(`/providers/${id}/availability`, {
      method: "PUT",
      body: JSON.stringify({ availability }),
    });
  },
  getAppointments: async (id: string, params?: Record<string, string>): Promise<ApiResponse<Appointment[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Appointment[]>(`/providers/${id}/appointments${query}`);
  },
  getPatientPanel: async (id: string): Promise<ApiResponse<unknown>> => {
    if (useMockData()) return { data: null };
    return apiFetch<unknown>(`/analytics/providers/${id}/patient-panel`);
  },
  getRevenue: async (id: string): Promise<ApiResponse<unknown>> => {
    if (useMockData()) return { data: null };
    return apiFetch<unknown>(`/analytics/providers/${id}/revenue`);
  },
  // Patient panel CRUD — drives the Provider detail "Panel" tab.
  // Returns { assigned, recent } so the tab can show formal panel
  // members + appointment-history patients in one view.
  panelMembers: async (id: string): Promise<ApiResponse<{
    assigned: Array<Record<string, unknown>>;
    recent: Array<Record<string, unknown>>;
    providerId: string;
  }>> => {
    if (useMockData()) return { data: { assigned: [], recent: [], providerId: id } };
    return apiFetch(`/providers/${id}/panel`);
  },
  assignToPanel: async (id: string, patientId: string): Promise<ApiResponse<unknown>> => {
    if (useMockData()) return { data: null };
    return apiFetch(`/providers/${id}/panel/assign`, {
      method: "POST",
      body: JSON.stringify({ patientId }),
    });
  },
  unassignFromPanel: async (id: string, patientId: string): Promise<ApiResponse<unknown>> => {
    if (useMockData()) return { data: null };
    return apiFetch(`/providers/${id}/panel/${patientId}`, { method: "DELETE" });
  },
  // Programs this provider participates in. Drives the Provider detail
  // "Programs" tab (admin viewing any provider, or provider viewing self).
  getPrograms: async (id: string): Promise<ApiResponse<Array<{
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    is_active: boolean;
    color: string | null;
    active_enrollment_count: number;
    panel_capacity: number | null;
    role: string | null;
    is_provider_active: boolean;
    joined_at: string | null;
  }>>> => {
    if (useMockData()) return { data: [] };
    return apiFetch(`/providers/${id}/programs`);
  },

  // External calendar sync (Path A — read-only iCal pull from
  // Google/Apple/Outlook). Three endpoints: status, set/clear URL,
  // manual sync. URL itself is never returned to the client (it's
  // encrypted at rest); we only get the connection state.
  getExternalCalendar: async (id: string): Promise<ApiResponse<{
    connected: boolean;
    syncedAt: string | null;
    syncStatus: "ok" | "error" | null;
    syncError: string | null;
    busyBlockCount: number;
  }>> => {
    if (useMockData()) return { data: { connected: false, syncedAt: null, syncStatus: null, syncError: null, busyBlockCount: 0 } };
    return apiFetch(`/providers/${id}/external-calendar`);
  },
  setExternalCalendar: async (id: string, url: string | null): Promise<ApiResponse<{ connected: boolean; message: string }>> => {
    if (useMockData()) return { data: { connected: !!url, message: "ok" } };
    return apiFetch(`/providers/${id}/external-calendar`, {
      method: "PUT",
      body: JSON.stringify({ url }),
    });
  },
  syncExternalCalendar: async (id: string): Promise<ApiResponse<{
    status: string;
    count: number;
    syncedAt: string | null;
    reason?: string;
  }>> => {
    if (useMockData()) return { data: { status: "ok", count: 0, syncedAt: null } };
    return apiFetch(`/providers/${id}/external-calendar/sync`, { method: "POST" });
  },
  // Imported personal-calendar events. Returns time blocks ONLY (no
  // event titles) so the practice calendar grid can render them as
  // gray "busy" blocks alongside patient appointments without
  // leaking PHI across the practice/provider boundary.
  // Note: apiFetch transforms snake_case → camelCase, so the keys
  // arrive at callers as startsAt / endsAt / allDay even though the
  // backend ships starts_at / ends_at / all_day.
  getBusyBlocks: async (id: string, dateFrom?: string, dateTo?: string): Promise<ApiResponse<Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    label: string;
  }>>> => {
    if (useMockData()) return { data: [] };
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);
    const q = qs.toString();
    return apiFetch(`/providers/${id}/busy-blocks${q ? `?${q}` : ""}`);
  },
};

// ─── Provider Credentials ───────────────────────────────────────────────────
// Backed by /api/provider-credentials (apiResource) plus two extras:
//   GET /provider-credentials/expiring?days=N
//   GET /provider-credentials/compliance-score?provider_id=...
// The backend auto-derives status from expiration_date when not supplied
// (active / expiring_soon / expired), so the UI doesn't need to compute it.

export interface ProviderCredentialDTO {
  id: string;
  providerId: string;
  type: string;            // medical_license, dea, board_cert, malpractice, cpr, npi, etc.
  name: string;
  credentialNumber?: string | null;
  issuer?: string | null;
  issuedDate?: string | null;
  expirationDate?: string | null;
  status?: "active" | "expired" | "expiring_soon" | "pending" | "revoked" | null;
  documentUrl?: string | null;
  notes?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const credentialService = {
  list: async (filters?: { providerId?: string; status?: string; type?: string; search?: string }): Promise<ApiResponse<ProviderCredentialDTO[]>> => {
    if (useMockData()) return { data: [] };
    const params = new URLSearchParams();
    if (filters?.providerId) params.set("provider_id", filters.providerId);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.type) params.set("type", filters.type);
    if (filters?.search) params.set("search", filters.search);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<ProviderCredentialDTO[]>(`/provider-credentials${qs}`);
  },
  create: async (data: Partial<ProviderCredentialDTO>): Promise<ApiResponse<ProviderCredentialDTO>> => {
    if (useMockData()) return mockCreate<ProviderCredentialDTO>(data);
    return apiFetch<ProviderCredentialDTO>("/provider-credentials", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<ProviderCredentialDTO>): Promise<ApiResponse<ProviderCredentialDTO>> => {
    if (useMockData()) return mockUpdate<ProviderCredentialDTO>(data);
    return apiFetch<ProviderCredentialDTO>(`/provider-credentials/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/provider-credentials/${id}`, { method: "DELETE" });
  },
  expiring: async (days: number = 90): Promise<ApiResponse<ProviderCredentialDTO[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ProviderCredentialDTO[]>(`/provider-credentials/expiring?days=${days}`);
  },
};

// ─── Clinical Settings Lists ───────────────────────────────────────────────
// Five practice-scoped lists managed from Practice Settings → Clinical.
// Each list has its own backend table for sharp FKs, but the frontend
// only sees a uniform CRUD shape: list / create / update / delete /
// bulkReplace (the natural fit for the inline-array editor in the
// Settings UI). Adding a sixth list is a one-line addition to
// CLINICAL_LIST_TYPES — backend already accepts any value the
// controller's allowlist includes.

export type ClinicalListType =
  | "visit_statuses"
  | "visit_reasons"
  | "conditions"
  | "treatment_modalities"
  | "patient_populations"
  | "cancellation_reasons";

export interface ClinicalListItem {
  id: string;
  tenantId?: string;
  label: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const clinicalSettingsService = {
  list: async (type: ClinicalListType): Promise<ApiResponse<ClinicalListItem[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ClinicalListItem[]>(`/clinical-settings/${type}`);
  },
  create: async (type: ClinicalListType, data: Partial<ClinicalListItem>): Promise<ApiResponse<ClinicalListItem>> => {
    if (useMockData()) return mockCreate<ClinicalListItem>(data);
    return apiFetch<ClinicalListItem>(`/clinical-settings/${type}`, { method: "POST", body: JSON.stringify(data) });
  },
  update: async (type: ClinicalListType, id: string, data: Partial<ClinicalListItem>): Promise<ApiResponse<ClinicalListItem>> => {
    if (useMockData()) return mockUpdate<ClinicalListItem>(data);
    return apiFetch<ClinicalListItem>(`/clinical-settings/${type}/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  delete: async (type: ClinicalListType, id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/clinical-settings/${type}/${id}`, { method: "DELETE" });
  },
  bulkReplace: async (type: ClinicalListType, items: Partial<ClinicalListItem>[]): Promise<ApiResponse<ClinicalListItem[]>> => {
    if (useMockData()) return { data: items as ClinicalListItem[] };
    return apiFetch<ClinicalListItem[]>(`/clinical-settings/${type}/bulk`, { method: "PUT", body: JSON.stringify({ items }) });
  },
};

// ─── Membership Plans ───────────────────────────────────────────────────────

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

// ─── Patients ───────────────────────────────────────────────────────────────

/**
 * Translate the camelCase form payload to the snake_case shape the backend's
 * StorePatientRequest validator expects. Address fields collapse:
 * addressLine1 + addressLine2 -> address. Emergency contact fields fold
 * into emergency_contacts: [{name, phone, relation}].
 */
function toPatientApiPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.firstName !== undefined) out.first_name = input.firstName;
  if (input.lastName !== undefined) out.last_name = input.lastName;
  if (input.email !== undefined) out.email = input.email;
  if (input.phone !== undefined) out.phone = input.phone;
  if (input.dateOfBirth !== undefined) out.date_of_birth = input.dateOfBirth;
  if (input.gender !== undefined) out.gender = input.gender;
  if (input.pronouns !== undefined) out.pronouns = input.pronouns;
  if (input.preferredName !== undefined) out.preferred_name = input.preferredName;
  if (input.addressLine1 !== undefined || input.addressLine2 !== undefined) {
    const a1 = (input.addressLine1 as string) || "";
    const a2 = (input.addressLine2 as string) || "";
    out.address = [a1, a2].filter(Boolean).join(", ");
  } else if (input.address !== undefined) {
    out.address = input.address;
  }
  if (input.city !== undefined) out.city = input.city;
  if (input.state !== undefined) out.state = input.state;
  if (input.zip !== undefined) out.zip = input.zip;
  if (input.preferredLanguage !== undefined) out.preferred_language = input.preferredLanguage;
  if (input.maritalStatus !== undefined) out.marital_status = input.maritalStatus;
  if (input.employmentStatus !== undefined) out.employment_status = input.employmentStatus;
  if (Array.isArray(input.emergencyContacts)) {
    out.emergency_contacts = input.emergencyContacts;
  } else if (input.emergencyContactName || input.emergencyContactPhone) {
    out.emergency_contacts = [{
      name: input.emergencyContactName || "",
      phone: input.emergencyContactPhone || "",
      relation: input.emergencyContactRelation || "",
    }];
  }
  if (Array.isArray(input.allergies)) out.allergies = input.allergies;
  if (Array.isArray(input.currentMedications)) out.medications = input.currentMedications;
  if (Array.isArray(input.medications)) out.medications = input.medications;
  if (Array.isArray(input.chronicConditions)) out.primary_diagnoses = input.chronicConditions;
  if (Array.isArray(input.primaryDiagnoses)) out.primary_diagnoses = input.primaryDiagnoses;
  if (input.primaryCarePhysician !== undefined) out.primary_care_physician = input.primaryCarePhysician;
  if (input.pcpPhone !== undefined) out.pcp_phone = input.pcpPhone;
  if (input.referringProvider !== undefined) out.referring_provider = input.referringProvider;
  if (input.insurancePrimary !== undefined) out.insurance_primary = input.insurancePrimary;
  if (input.insuranceSecondary !== undefined) out.insurance_secondary = input.insuranceSecondary;
  if (input.pharmacyName !== undefined) out.pharmacy_name = input.pharmacyName;
  if (input.pharmacyAddress !== undefined) out.pharmacy_address = input.pharmacyAddress;
  if (input.pharmacyPhone !== undefined) out.pharmacy_phone = input.pharmacyPhone;
  if (input.referralSource !== undefined) out.referral_source = input.referralSource;
  return out;
}

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
  create: async (data: Record<string, unknown>): Promise<ApiResponse<Patient>> => {
    if (useMockData()) return mockCreate<Patient>(data as Partial<Patient>);
    return apiFetch<Patient>("/patients", { method: "POST", body: JSON.stringify(toPatientApiPayload(data)) });
  },
  update: async (id: string, data: Record<string, unknown>): Promise<ApiResponse<Patient>> => {
    if (useMockData()) return mockUpdate<Patient>(data as Partial<Patient>);
    return apiFetch<Patient>(`/patients/${id}`, { method: "PUT", body: JSON.stringify(toPatientApiPayload(data)) });
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/patients/${id}`, { method: "DELETE" });
  },
  // Sub-resources
  getMemberships: async (id: string): Promise<ApiResponse<PatientMembership[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PatientMembership[]>(`/patients/${id}/memberships`);
  },
  getAppointments: async (id: string, params?: Record<string, string>): Promise<ApiResponse<Appointment[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Appointment[]>(`/patients/${id}/appointments${query}`);
  },
  getEncounters: async (id: string, params?: Record<string, string>): Promise<ApiResponse<Encounter[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Encounter[]>(`/patients/${id}/encounters${query}`);
  },
  getPrescriptions: async (id: string, params?: Record<string, string>): Promise<ApiResponse<Prescription[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Prescription[]>(`/patients/${id}/prescriptions${query}`);
  },
  getScreenings: async (id: string, params?: Record<string, string>): Promise<ApiResponse<ScreeningResponse[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ScreeningResponse[]>(`/patients/${id}/screenings${query}`);
  },
  getDocuments: async (id: string, params?: Record<string, string>): Promise<ApiResponse<Document[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Document[]>(`/patients/${id}/documents${query}`);
  },
};

// ─── Memberships ────────────────────────────────────────────────────────────

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
  getEntitlements: async (id: string): Promise<ApiResponse<PatientEntitlement[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PatientEntitlement[]>(`/memberships/${id}/entitlements`);
  },
  recordVisit: async (id: string, data?: Record<string, unknown>): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id });
    return apiFetch<PatientMembership>(`/memberships/${id}/record-visit`, { method: "POST", body: JSON.stringify(data || {}) });
  },
  // Convenience aliases (cancel/pause/resume use update with status)
  cancel: async (id: string, reason?: string): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id, status: "canceled", cancelReason: reason });
    return apiFetch<PatientMembership>(`/memberships/${id}`, { method: "PUT", body: JSON.stringify({ status: "canceled", cancelReason: reason }) });
  },
  pause: async (id: string): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id, status: "paused" });
    return apiFetch<PatientMembership>(`/memberships/${id}`, { method: "PUT", body: JSON.stringify({ status: "paused" }) });
  },
  resume: async (id: string): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id, status: "active" });
    return apiFetch<PatientMembership>(`/memberships/${id}`, { method: "PUT", body: JSON.stringify({ status: "active" }) });
  },
  /**
   * Patient self-service cancel — always end-of-period. The patient
   * keeps coverage they paid for; Stripe subscription is cancelled at
   * period close. Reason capture mirrors the admin cancel flow so churn
   * analytics stay consistent across channels.
   */
  selfCancel: async (
    id: string,
    body: {
      // Free-form string sourced from the practice's curated
      // cancellation_reasons list. Was a fixed enum prior to that
      // list shipping; backend validation now accepts any short
      // string (capped at 100 chars).
      reason: string;
      reason_notes?: string;
      retention_declined?: "pause" | "downgrade" | "contact";
    },
  ): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id, status: "canceled" });
    return apiFetch<PatientMembership>(`/memberships/${id}/self-cancel`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  // ─── Stripe-dashboard parity (2026-05-05) ─────────────────────────
  // Each method below mirrors a Stripe customer-page action so the
  // practice admin can do everything from MemberMD without bouncing
  // into Stripe directly.

  /** Create + send a Stripe-hosted Billing Portal link via email/SMS. */
  sendBillingPortalLink: async (
    id: string,
    body: { channels: Array<"email" | "sms">; note?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<ApiResponse<{ portalUrl: string; deliveredVia: string[] }>> => {
    if (useMockData()) return { data: { portalUrl: "", deliveredVia: ["email"] } };
    return apiFetch(`/memberships/${id}/billing-portal-link`, { method: "POST", body: JSON.stringify(body) });
  },

  /** Pause Stripe collection without cancelling the subscription. */
  pauseCollection: async (
    id: string,
    body?: { behavior?: "keep_as_draft" | "mark_uncollectible" | "void"; resumeAt?: string },
  ): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id });
    return apiFetch(`/memberships/${id}/pause-collection`, { method: "POST", body: JSON.stringify(body || {}) });
  },

  /** Resume previously-paused Stripe collection. */
  resumeCollection: async (id: string): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id });
    return apiFetch(`/memberships/${id}/resume-collection`, { method: "POST", body: "{}" });
  },

  /** Refund a single PaymentIntent (per-payment kebab action). */
  refundSinglePayment: async (
    id: string,
    body: { paymentIntent: string; amountCents?: number; reason?: "requested_by_customer" | "duplicate" | "fraudulent" },
  ): Promise<ApiResponse<{ id: string; amount: number; status: string }>> => {
    if (useMockData()) return { data: { id: "re_mock", amount: 0, status: "succeeded" } };
    return apiFetch(`/memberships/${id}/refund-payment`, { method: "POST", body: JSON.stringify(body) });
  },

  /** Re-send a Stripe-hosted receipt for a past payment. */
  sendReceipt: async (
    id: string,
    body: { paymentIntent: string },
  ): Promise<ApiResponse<{ membershipId: string }>> => {
    if (useMockData()) return { data: { membershipId: id } };
    return apiFetch(`/memberships/${id}/send-receipt`, { method: "POST", body: JSON.stringify(body) });
  },

  /** Read-only preview of the next Stripe invoice for this subscription. */
  upcomingInvoice: async (id: string): Promise<ApiResponse<{
    amountDue: number;
    currency: string;
    periodStart: string | null;
    periodEnd: string | null;
    nextPaymentAttempt: string | null;
  } | null>> => {
    if (useMockData()) return { data: null };
    return apiFetch(`/memberships/${id}/upcoming-invoice`);
  },

  /** Admin cancel with the full Stripe-style decision matrix:
   *   - immediately | end-of-period | custom date
   *   - optional refund of the last paid invoice (immediate cancels only)
   */
  adminCancel: async (
    id: string,
    body: {
      reason: "moved" | "cost" | "dissatisfied" | "switching_provider" | "other";
      reasonNotes?: string;
      retentionDeclined?: "pause" | "downgrade" | "contact";
      immediately?: boolean;
      cancelAt?: string; // ISO datetime (custom-date cancel)
      refundLastPayment?: boolean;
      refundAmountCents?: number;
    },
  ): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id, status: "canceled" });
    return apiFetch(`/memberships/${id}/cancel`, { method: "POST", body: JSON.stringify(body) });
  },
};

// ─── Per-patient billing settings + insights ──────────────────────────
// Mirrors Stripe's customer-page "Insights" panel + "Billing emails"
// override. Keyed off patient_id; works alongside membershipService for
// the membership-keyed actions.
export const patientBillingService = {
  getInsights: async (patientId: string): Promise<ApiResponse<{
    spent: number;
    mrr: number;
    billingFrequency: string | null;
    memberSince: string | null;
    billingEmail: string | null;
    billingEmailOverride: string | null;
  }>> => {
    if (useMockData()) {
      return {
        data: {
          spent: 0, mrr: 0, billingFrequency: null, memberSince: null,
          billingEmail: null, billingEmailOverride: null,
        },
      };
    }
    return apiFetch(`/patients/${patientId}/billing-insights`);
  },
  setBillingEmail: async (
    patientId: string,
    billingEmail: string | null,
  ): Promise<ApiResponse<{ billingEmailOverride: string | null; billingEmail: string | null }>> => {
    if (useMockData()) {
      return { data: { billingEmailOverride: billingEmail, billingEmail: billingEmail ?? "" } };
    }
    return apiFetch(`/patients/${patientId}/billing-email`, {
      method: "PUT",
      body: JSON.stringify({ billingEmail: billingEmail ?? "" }),
    });
  },
};

/**
 * Tier 2 card-on-file management — calls into the practice's connected
 * Stripe account. createSetupIntent returns a client_secret that the
 * frontend uses with Stripe Elements / confirmCardSetup; once that
 * resolves, attach() saves the card as the customer default and
 * updates active subscriptions to use it.
 */
export const paymentMethodService = {
  list: async (): Promise<ApiResponse<Array<{
    id: string;
    brand: string | null;
    last4: string | null;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean;
  }>>> => {
    if (useMockData()) return { data: [] };
    return apiFetch("/payment-methods");
  },
  createSetupIntent: async (): Promise<ApiResponse<{
    client_secret: string;
    stripe_publishable_key: string;
    stripe_account_id: string;
  }>> => {
    if (useMockData()) return { data: { client_secret: "mock", stripe_publishable_key: "mock", stripe_account_id: "mock" } };
    return apiFetch("/payment-methods/setup-intent", { method: "POST" });
  },
  attach: async (paymentMethodId: string): Promise<ApiResponse<{ message: string }>> => {
    if (useMockData()) return { data: { message: "Mocked." } };
    return apiFetch("/payment-methods/attach", {
      method: "POST",
      body: JSON.stringify({ payment_method_id: paymentMethodId }),
    });
  },
};

// ─── Entitlements ───────────────────────────────────────────────────────────

export const entitlementService = {
  listForMembership: async (membershipId: string): Promise<ApiResponse<PatientEntitlement[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PatientEntitlement[]>(`/memberships/${membershipId}/entitlements`);
  },
  recordUsage: async (membershipId: string, quantity?: number): Promise<ApiResponse<PatientMembership>> => {
    if (useMockData()) return mockUpdate<PatientMembership>({ id: membershipId });
    return apiFetch<PatientMembership>(`/memberships/${membershipId}/record-visit`, { method: "POST", body: JSON.stringify({ quantity: quantity ?? 1 }) });
  },
};

// ─── Appointments ───────────────────────────────────────────────────────────

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
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/appointments/${id}`, { method: "DELETE" });
  },
  today: async (): Promise<ApiResponse<Appointment[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<Appointment[]>("/appointments/today");
  },
  // Convenience methods that use update under the hood
  cancel: async (id: string, reason?: string): Promise<ApiResponse<Appointment>> => {
    if (useMockData()) return mockUpdate<Appointment>({ id, status: "canceled", cancelReason: reason });
    return apiFetch<Appointment>(`/appointments/${id}`, { method: "PUT", body: JSON.stringify({ status: "canceled", cancelReason: reason }) });
  },
  checkIn: async (id: string): Promise<ApiResponse<Appointment>> => {
    if (useMockData()) return mockUpdate<Appointment>({ id, status: "checked_in" });
    return apiFetch<Appointment>(`/appointments/${id}`, { method: "PUT", body: JSON.stringify({ status: "checked_in" }) });
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
  deleteType: async (id: string): Promise<ApiResponse<{ message: string }>> => {
    if (useMockData()) return { data: { message: "ok" } };
    return apiFetch<{ message: string }>(`/appointment-types/${id}`, { method: "DELETE" });
  },
  /**
   * Pre-flight check for the required-documents gate. Pass the type id
   * + patient id; returns which required items the patient already
   * has and which are missing. Booking widget calls this when the
   * patient picks a visit type and surfaces a Step 0 to collect
   * anything missing before the calendar.
   */
  preflightType: async (typeId: string, patientId: string): Promise<ApiResponse<{
    blocksBooking: boolean;
    items: Array<{
      kind: "consent_template" | "screening_template";
      id: string;
      name: string;
      blocksBooking: boolean;
      freshnessDays: number | null;
      isSatisfied: boolean;
      satisfiedAt: string | null;
      expiresAt: string | null;
    }>;
  }>> => {
    if (useMockData()) return { data: { blocksBooking: false, items: [] } };
    const q = new URLSearchParams({ patient_id: patientId });
    return apiFetch(`/appointment-types/${typeId}/preflight?${q.toString()}`);
  },
  availableSlots: async (providerId: string, date: string, duration: number): Promise<ApiResponse<AvailableSlot[]>> => {
    if (useMockData()) {
      return { data: [
        { start: "09:00", end: "09:30" }, { start: "09:30", end: "10:00" },
        { start: "10:00", end: "10:30" }, { start: "10:30", end: "11:00" },
        { start: "11:00", end: "11:30" }, { start: "11:30", end: "12:00" },
        { start: "13:00", end: "13:30" }, { start: "13:30", end: "14:00" },
        { start: "14:00", end: "14:30" }, { start: "14:30", end: "15:00" },
        { start: "15:00", end: "15:30" }, { start: "15:30", end: "16:00" },
        { start: "16:00", end: "16:30" },
      ] };
    }
    return apiFetch<AvailableSlot[]>(`/appointments/available-slots?provider_id=${providerId}&date=${date}&duration=${duration}`);
  },
  calendarLinks: async (id: string): Promise<ApiResponse<CalendarLinks>> => {
    if (useMockData()) return { data: { google: "#", yahoo: "#", outlook: "#", ical: "#" } };
    return apiFetch<CalendarLinks>(`/appointments/${id}/calendar-links`);
  },
  reschedule: async (id: string, data: { scheduled_at: string }): Promise<ApiResponse<Appointment>> => {
    if (useMockData()) return mockUpdate<Appointment>({ id });
    return apiFetch<Appointment>(`/appointments/${id}/reschedule`, { method: "PUT", body: JSON.stringify(data) });
  },
};

// ─── Encounters ─────────────────────────────────────────────────────────────

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
  // getDetail returns the encounter plus audit_logs. The backend nests
  // both under `data` so apiFetch's standard unwrapping just works.
  getDetail: async (id: string): Promise<ApiResponse<Encounter & { auditLogs?: any[] }>> => {
    if (useMockData()) return { data: { auditLogs: [] } as any };
    return apiFetch<Encounter & { auditLogs?: any[] }>(`/encounters/${id}/detail`);
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

// ─── Chart Templates ────────────────────────────────────────────────────────
// Server returns:
//   GET /chart-templates -> ChartTemplate[]
//   POST /chart-templates -> ChartTemplate
//   POST /chart-templates/{id}/clone -> ChartTemplate
// Field shape: { id, label, type, options[], required, section, unit?,
//                reference_range?: { min?, max? } }
// Type values: text, textarea, number, select, checkbox, checkbox_group,
//              radio, date, vitals.
export interface ChartTemplateField {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox" | "checkbox_group" | "radio" | "date" | "vitals";
  options?: string[] | null;
  required: boolean;
  section: string;
  unit?: string | null;
  referenceRange?: { min?: number; max?: number } | null;
}

export interface ChartTemplate {
  id: string;
  tenantId: string | null;
  name: string;
  description?: string | null;
  visitType?: string | null;
  fields: ChartTemplateField[];
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export const chartTemplateService = {
  list: async (visitType?: string): Promise<ApiResponse<ChartTemplate[]>> => {
    if (useMockData()) return { data: [] };
    const query = visitType ? `?visit_type=${encodeURIComponent(visitType)}` : "";
    return apiFetch<ChartTemplate[]>(`/chart-templates${query}`);
  },
  get: async (id: string): Promise<ApiResponse<ChartTemplate>> => {
    if (useMockData()) return { data: {} as ChartTemplate };
    return apiFetch<ChartTemplate>(`/chart-templates/${id}`);
  },
  create: async (data: Partial<ChartTemplate>): Promise<ApiResponse<ChartTemplate>> => {
    if (useMockData()) return mockCreate<ChartTemplate>(data);
    return apiFetch<ChartTemplate>("/chart-templates", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<ChartTemplate>): Promise<ApiResponse<ChartTemplate>> => {
    if (useMockData()) return mockUpdate<ChartTemplate>(data);
    return apiFetch<ChartTemplate>(`/chart-templates/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  clone: async (id: string): Promise<ApiResponse<ChartTemplate>> => {
    if (useMockData()) return { data: {} as ChartTemplate };
    return apiFetch<ChartTemplate>(`/chart-templates/${id}/clone`, { method: "POST" });
  },
  deactivate: async (id: string): Promise<ApiResponse<{ message: string }>> => {
    if (useMockData()) return { data: { message: "ok" } };
    return apiFetch<{ message: string }>(`/chart-templates/${id}`, { method: "DELETE" });
  },
};

// ─── Prescriptions ──────────────────────────────────────────────────────────

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
  refill: async (id: string): Promise<ApiResponse<Prescription>> => {
    if (useMockData()) return mockUpdate<Prescription>({ id });
    return apiFetch<Prescription>(`/prescriptions/${id}/refill`, { method: "POST" });
  },
  updateRefill: async (id: string, data: Partial<Prescription>): Promise<ApiResponse<Prescription>> => {
    if (useMockData()) return mockUpdate<Prescription>(data);
    return apiFetch<Prescription>(`/prescriptions/${id}/refill`, { method: "PUT", body: JSON.stringify(data) });
  },
  // Convenience: cancel via update
  cancel: async (id: string): Promise<ApiResponse<Prescription>> => {
    if (useMockData()) return mockUpdate<Prescription>({ id, status: "canceled" });
    return apiFetch<Prescription>(`/prescriptions/${id}`, { method: "PUT", body: JSON.stringify({ status: "canceled" }) });
  },
  downloadPdf: (id: string) => {
    window.open(`${API_BASE_URL}/prescriptions/${id}/pdf`, "_blank");
  },
  efax: async (id: string, pharmacyFax: string): Promise<ApiResponse<Prescription>> => {
    if (useMockData()) return mockUpdate<Prescription>({ id, status: "sent" as "active" });
    return apiFetch<Prescription>(`/prescriptions/${id}/efax`, { method: "POST", body: JSON.stringify({ pharmacyFax }) });
  },
};

// ─── Screenings ─────────────────────────────────────────────────────────────

export const screeningService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<ScreeningResponse[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ScreeningResponse[]>(`/screenings${query}`);
  },
  getById: async (id: string): Promise<ApiResponse<ScreeningResponse>> => {
    if (useMockData()) return { data: {} as ScreeningResponse };
    return apiFetch<ScreeningResponse>(`/screenings/${id}`);
  },
  create: async (data: Partial<ScreeningResponse>): Promise<ApiResponse<ScreeningResponse>> => {
    if (useMockData()) return mockCreate<ScreeningResponse>(data);
    return apiFetch<ScreeningResponse>("/screenings", { method: "POST", body: JSON.stringify(data) });
  },
  listTemplates: async (): Promise<ApiResponse<ScreeningTemplate[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ScreeningTemplate[]>("/screening-templates");
  },
  // Legacy aliases
  listResponses: async (params?: Record<string, string>): Promise<ApiResponse<ScreeningResponse[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ScreeningResponse[]>(`/screenings${query}`);
  },
  submitResponse: async (data: Partial<ScreeningResponse>): Promise<ApiResponse<ScreeningResponse>> => {
    if (useMockData()) return mockCreate<ScreeningResponse>(data);
    return apiFetch<ScreeningResponse>("/screenings", { method: "POST", body: JSON.stringify(data) });
  },
  createTemplate: async (data: Partial<ScreeningTemplate>): Promise<ApiResponse<ScreeningTemplate>> => {
    if (useMockData()) return mockCreate<ScreeningTemplate>(data);
    return apiFetch<ScreeningTemplate>("/screening-templates", { method: "POST", body: JSON.stringify(data) });
  },
};

// ─── Messages ───────────────────────────────────────────────────────────────

export const messageService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Message[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Message[]>(`/messages${query}`);
  },
  getThread: async (threadId: string): Promise<ApiResponse<Message[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<Message[]>(`/messages/thread/${threadId}`);
  },
  send: async (data: Partial<Message>): Promise<ApiResponse<Message>> => {
    if (useMockData()) return mockCreate<Message>(data);
    return apiFetch<Message>("/messages", { method: "POST", body: JSON.stringify(data) });
  },
  markRead: async (id: string): Promise<ApiResponse<Message>> => {
    if (useMockData()) return mockUpdate<Message>({ id, isRead: true });
    return apiFetch<Message>(`/messages/${id}/read`, { method: "PUT" });
  },
  getUnreadCount: async (): Promise<ApiResponse<{ count: number }>> => {
    if (useMockData()) return { data: { count: 0 } };
    return apiFetch<{ count: number }>("/messages/unread-count");
  },
  // Legacy alias
  getById: async (id: string): Promise<ApiResponse<Message>> => {
    if (useMockData()) return { data: {} as Message };
    return apiFetch<Message>(`/messages/thread/${id}`);
  },
};

// ─── Invoices ───────────────────────────────────────────────────────────────

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
  getPdf: async (id: string): Promise<ApiResponse<Blob>> => {
    if (useMockData()) return { data: new Blob() };
    // PDF download — use raw fetch to get blob
    const token = getAuthToken();
    const headers: Record<string, string> = { Accept: "application/pdf" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const res = await fetch(`${API_BASE_URL}/invoices/${id}/pdf`, { headers, credentials: "include" });
      if (!res.ok) return { error: `Failed to download PDF (${res.status})` };
      const blob = await res.blob();
      return { data: blob };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Network error" };
    }
  },
  update: async (id: string, data: Partial<Invoice>): Promise<ApiResponse<Invoice>> => {
    if (useMockData()) return mockUpdate<Invoice>(data);
    return apiFetch<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  // Legacy convenience methods
  send: async (id: string): Promise<ApiResponse<Invoice>> => {
    if (useMockData()) return mockUpdate<Invoice>({ id, status: "sent" });
    return apiFetch<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify({ status: "sent" }) });
  },
  void: async (id: string): Promise<ApiResponse<Invoice>> => {
    if (useMockData()) return mockUpdate<Invoice>({ id, status: "void" });
    return apiFetch<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify({ status: "void" }) });
  },
};

// ─── Payments ───────────────────────────────────────────────────────────────

export const paymentService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Payment[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Payment[]>(`/payments${query}`);
  },
  create: async (data: Partial<Payment>): Promise<ApiResponse<Payment>> => {
    if (useMockData()) return mockCreate<Payment>(data);
    return apiFetch<Payment>("/payments", { method: "POST", body: JSON.stringify(data) });
  },
  refund: async (id: string, amount?: number): Promise<ApiResponse<Payment>> => {
    if (useMockData()) return mockUpdate<Payment>({ id, status: "refunded" });
    return apiFetch<Payment>(`/payments/${id}/refund`, { method: "POST", body: JSON.stringify({ amount }) });
  },
  // Legacy alias
  getById: async (id: string): Promise<ApiResponse<Payment>> => {
    if (useMockData()) return { data: {} as Payment };
    return apiFetch<Payment>(`/payments/${id}`);
  },
};

// ─── Consent ────────────────────────────────────────────────────────────────

/**
 * Public-facing consent template payload returned by
 *   GET /external/consent-templates/{tenantCode}
 * Used by the enrollment widget to render previews. Slugs are stable
 * across versions — UI keys off slug, not id.
 */
export interface PublicConsentTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  content: string;
  version: string;
  version_int: number;
  is_required: boolean;
  display_order: number;
}

export const consentService = {
  /** Public — fetched by EnrollmentWidget for the preview modal. */
  publicForEnrollment: async (tenantCode: string): Promise<ApiResponse<PublicConsentTemplate[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PublicConsentTemplate[]>(`/external/consent-templates/${tenantCode}`);
  },

  /**
   * Practice admin — split response: tenant-customized templates and
   * platform templates the admin can fork+edit.
   */
  listTemplates: async (): Promise<ApiResponse<{
    tenant: ConsentTemplate[];
    platform_available_to_fork: ConsentTemplate[];
  }>> => {
    if (useMockData()) return { data: { tenant: [], platform_available_to_fork: [] } };
    return apiFetch(`/consent-templates`);
  },
  getTemplate: async (id: string): Promise<ApiResponse<ConsentTemplate>> => {
    if (useMockData()) return { data: {} as ConsentTemplate };
    return apiFetch<ConsentTemplate>(`/consent-templates/${id}`);
  },
  createTemplate: async (data: Partial<ConsentTemplate> & {
    content: string;
    parent_template_id?: string | null;
    type?: string;
    description?: string | null;
    is_required?: boolean;
    display_order?: number;
    slug?: string | null;
  }): Promise<ApiResponse<ConsentTemplate>> => {
    if (useMockData()) return mockCreate<ConsentTemplate>(data as Partial<ConsentTemplate>);
    return apiFetch<ConsentTemplate>("/consent-templates", { method: "POST", body: JSON.stringify(data) });
  },
  updateTemplate: async (id: string, data: Partial<ConsentTemplate>): Promise<ApiResponse<ConsentTemplate>> => {
    if (useMockData()) return mockUpdate<ConsentTemplate>(data);
    return apiFetch<ConsentTemplate>(`/consent-templates/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  /** Bumps version, supersedes the current template, keeps existing signatures locked. */
  publishVersion: async (id: string, content: string, description?: string): Promise<ApiResponse<ConsentTemplate>> => {
    if (useMockData()) return mockUpdate<ConsentTemplate>({ id });
    return apiFetch<ConsentTemplate>(`/consent-templates/${id}/publish-version`, {
      method: "POST",
      body: JSON.stringify({ content, description }),
    });
  },
  deleteTemplate: async (id: string): Promise<ApiResponse<{ message: string }>> => {
    if (useMockData()) return { data: { message: "Mocked." } };
    return apiFetch(`/consent-templates/${id}`, { method: "DELETE" });
  },

  /** Patient or admin — list signed consents. Patient only sees their own. */
  listSignatures: async (params?: { patient_id?: string; template_id?: string; membership_id?: string }): Promise<ApiResponse<ConsentSignature[]>> => {
    if (useMockData()) return { data: [] };
    const q = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    return apiFetch<ConsentSignature[]>(`/consent-signatures${q}`);
  },
  getSignature: async (id: string): Promise<ApiResponse<ConsentSignature>> => {
    if (useMockData()) return { data: {} as ConsentSignature };
    return apiFetch<ConsentSignature>(`/consent-signatures/${id}`);
  },
  /**
   * Returns the absolute URL for the signed-agreement PDF. Caller opens
   * in a new tab or anchors a link. Bearer token isn't part of the URL —
   * downloads must go through fetch with auth header for now.
   */
  signaturePdfUrl: (id: string): string => {
    const base = (typeof import.meta !== "undefined" ? (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL : null) || "";
    return `${base}/consent-signatures/${id}/pdf`;
  },
  /** Same for the membership-level agreement PDF (whole contract). */
  membershipAgreementPdfUrl: (membershipId: string): string => {
    const base = (typeof import.meta !== "undefined" ? (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL : null) || "";
    return `${base}/memberships/${membershipId}/agreement-pdf`;
  },
  /**
   * Authenticated PDF download. Fetches as blob with the bearer token,
   * triggers browser save. Use this from buttons; the signaturePdfUrl
   * helper is only useful for embedding in <iframe> previews etc.
   */
  downloadSignaturePdf: async (id: string, filename = "agreement.pdf"): Promise<void> => {
    return downloadAuthenticatedFile(`/consent-signatures/${id}/pdf`, filename);
  },
  downloadMembershipAgreementPdf: async (membershipId: string, filename = "membership-agreement.pdf"): Promise<void> => {
    return downloadAuthenticatedFile(`/memberships/${membershipId}/agreement-pdf`, filename);
  },

  sign: async (data: Partial<ConsentSignature>): Promise<ApiResponse<ConsentSignature>> => {
    if (useMockData()) return mockCreate<ConsentSignature>(data);
    return apiFetch<ConsentSignature>("/consent-signatures", { method: "POST", body: JSON.stringify(data) });
  },
  /** Admin-only — revokes a previously-signed consent. The signature row stays
   *  but is marked revoked so the audit trail reflects the active window. */
  revokeSignature: async (id: string, reason: string): Promise<ApiResponse<ConsentSignature>> => {
    if (useMockData()) return { data: {} as ConsentSignature };
    return apiFetch<ConsentSignature>(`/consent-signatures/${id}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
};

// ─── Signature Requests (admin → patient via email) ──────────────────────────

export interface SignatureRequestRow {
  id: string;
  status: "pending" | "signed" | "cancelled" | "expired";
  template_id: string;
  patient_id: string;
  message?: string | null;
  expires_at?: string | null;
  reminded_at?: string | null;
  created_at: string;
  template?: { id: string; name: string; type: string; version: string | number };
  patient?: { id: string; first_name: string; last_name: string; email: string };
}

export const signatureRequestService = {
  list: async (params?: { patient_id?: string; status?: string }): Promise<ApiResponse<SignatureRequestRow[]>> => {
    if (useMockData()) return { data: [] };
    const q = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    return apiFetch<SignatureRequestRow[]>(`/signature-requests${q}`);
  },
  create: async (data: {
    template_id: string;
    patient_id: string;
    membership_id?: string | null;
    message?: string | null;
    expires_in_days?: number | null;
  }): Promise<ApiResponse<SignatureRequestRow>> => {
    if (useMockData()) return mockCreate<SignatureRequestRow>(data as Partial<SignatureRequestRow>);
    return apiFetch<SignatureRequestRow>("/signature-requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  cancel: async (id: string): Promise<ApiResponse<SignatureRequestRow>> => {
    if (useMockData()) return { data: {} as SignatureRequestRow };
    return apiFetch<SignatureRequestRow>(`/signature-requests/${id}/cancel`, { method: "POST" });
  },
  resend: async (id: string): Promise<ApiResponse<SignatureRequestRow>> => {
    if (useMockData()) return { data: {} as SignatureRequestRow };
    return apiFetch<SignatureRequestRow>(`/signature-requests/${id}/resend`, { method: "POST" });
  },
};

/**
 * Fetch a binary endpoint with the auth token and trigger a browser
 * download. Used by signed-PDF download buttons.
 */
async function downloadAuthenticatedFile(path: string, filename: string): Promise<void> {
  const base = (typeof import.meta !== "undefined" ? (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL : null) || "";
  // Same token key the rest of api.ts uses. The earlier
  // localStorage fallbacks were never set, so authenticated downloads
  // (signed-PDF, CSV exports) were hitting the API with no auth header.
  const token = sessionStorage.getItem("membermd_token") ?? "";
  const res = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Documents ──────────────────────────────────────────────────────────────

export const documentService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<Document[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<Document[]>(`/documents${query}`);
  },
  upload: async (file: File, meta?: Record<string, string>): Promise<ApiResponse<Document>> => {
    if (useMockData()) return mockCreate<Document>(meta as Partial<Document>);
    const token = getAuthToken();
    const formData = new FormData();
    formData.append("file", file);
    if (meta) {
      for (const [key, value] of Object.entries(meta)) {
        formData.append(camelToSnake(key), value);
      }
    }
    try {
      const res = await fetch(`${API_BASE_URL}/documents`, {
        method: "POST",
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) return { error: json.message || "Upload failed" };
      return { data: transformKeys<Document>(json.data ?? json, snakeToCamel) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Network error" };
    }
  },
  download: async (id: string): Promise<ApiResponse<Blob>> => {
    if (useMockData()) return { data: new Blob() };
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const res = await fetch(`${API_BASE_URL}/documents/${id}/download`, { headers, credentials: "include" });
      if (!res.ok) return { error: `Download failed (${res.status})` };
      const blob = await res.blob();
      return { data: blob };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Network error" };
    }
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/documents/${id}`, { method: "DELETE" });
  },
  // Legacy alias
  getById: async (id: string): Promise<ApiResponse<Document>> => {
    if (useMockData()) return { data: {} as Document };
    return apiFetch<Document>(`/documents/${id}`);
  },
};

// ─── Audit ──────────────────────────────────────────────────────────────────

export const auditService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<AuditLog[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<AuditLog[]>(`/audit-logs${query}`);
  },
  getPhiAccess: async (params?: Record<string, string>): Promise<ApiResponse<PhiAccessLog[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<PhiAccessLog[]>(`/audit/phi-access${query}`);
  },
  getSecurityEvents: async (params?: Record<string, string>): Promise<ApiResponse<SecurityEvent[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<SecurityEvent[]>(`/audit/security-events${query}`);
  },
  getComplianceDashboard: async (): Promise<ApiResponse<ComplianceDashboardData>> => {
    if (useMockData()) return { data: {} as ComplianceDashboardData };
    return apiFetch<ComplianceDashboardData>("/audit/compliance-dashboard");
  },
  getHipaaChecklist: async (): Promise<ApiResponse<HipaaChecklistItem[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<HipaaChecklistItem[]>("/audit/hipaa-checklist");
  },
  exportLogs: async (params?: Record<string, string>): Promise<ApiResponse<Blob>> => {
    if (useMockData()) return { data: new Blob(["mock csv data"], { type: "text/csv" }) };
    const token = getAuthToken();
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    const headers: Record<string, string> = { Accept: "text/csv" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const res = await fetch(`${API_BASE_URL}/audit/export${query}`, { headers, credentials: "include" });
      if (!res.ok) return { error: `Export failed (${res.status})` };
      const blob = await res.blob();
      return { data: blob };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Network error" };
    }
  },
};

// ─── Telehealth ──────────────────────────────────────────────────────────────

export const telehealthService = {
  createSession: async (data: { appointmentId?: string; isExternal?: boolean; externalVideoUrl?: string; recordingEnabled?: boolean }): Promise<ApiResponse<TelehealthSession>> => {
    if (useMockData()) return mockCreate<TelehealthSession>(data);
    return apiFetch<TelehealthSession>("/telehealth", { method: "POST", body: JSON.stringify(data) });
  },
  getSession: async (id: string): Promise<ApiResponse<TelehealthSession>> => {
    if (useMockData()) return { data: {} as TelehealthSession };
    return apiFetch<TelehealthSession>(`/telehealth/${id}`);
  },
  joinSession: async (sessionId: string): Promise<ApiResponse<{ token: string; roomUrl: string; roomName: string; session: TelehealthSession }>> => {
    if (useMockData()) return { data: { token: "mock_meeting_token", roomUrl: "wss://mock.livekit.cloud", roomName: "mock-room", session: {} as TelehealthSession } };
    return apiFetch<{ token: string; roomUrl: string; roomName: string; session: TelehealthSession }>(`/telehealth/${sessionId}/join`, { method: "POST" });
  },
  endSession: async (sessionId: string): Promise<ApiResponse<TelehealthSession>> => {
    if (useMockData()) return mockUpdate<TelehealthSession>({ id: sessionId, status: "completed" });
    return apiFetch<TelehealthSession>(`/telehealth/${sessionId}/end`, { method: "POST" });
  },
  /** Provider/admin admits a patient out of the waiting room. */
  admitSession: async (sessionId: string): Promise<ApiResponse<TelehealthSession>> => {
    if (useMockData()) return mockUpdate<TelehealthSession>({ id: sessionId });
    return apiFetch<TelehealthSession>(`/telehealth/${sessionId}/admit`, { method: "POST" });
  },
  /** List patients currently in the waiting room. Provider role
   *  scopes to their own; admin sees the whole tenant. */
  listWaiting: async (): Promise<ApiResponse<Array<{
    id: string;
    appointmentId: string;
    patientName: string;
    patientJoinedAt: string;
    waitingSeconds: number;
    isExternal: boolean;
    scheduledAt: string | null;
  }>>> => {
    if (useMockData()) return { data: [] };
    return apiFetch(`/telehealth/waiting`);
  },
  giveConsent: async (sessionId: string): Promise<ApiResponse<TelehealthSession>> => {
    if (useMockData()) return mockUpdate<TelehealthSession>({ id: sessionId, recordingConsentGiven: true });
    return apiFetch<TelehealthSession>(`/telehealth/${sessionId}/consent`, { method: "POST" });
  },
  getToken: async (appointmentId: string): Promise<ApiResponse<{ token: string; roomUrl: string }>> => {
    if (useMockData()) return { data: { token: "mock_meeting_token", roomUrl: "wss://mock.livekit.cloud" } };
    return apiFetch<{ token: string; roomUrl: string }>(`/telehealth/appointment/${appointmentId}/token`);
  },
  /**
   * Resolve or create a telehealth session for the given appointment, then
   * return its session id so the caller can navigate to /telehealth/{id}.
   * Replaces the bug where PatientPortal navigated to a literal
   * `/telehealth/session-{appointmentId}` URL that doesn't resolve to a
   * real session UUID (audit finding B10, 2026-04-28).
   */
  openForAppointment: async (appointmentId: string): Promise<ApiResponse<{ sessionId: string }>> => {
    if (useMockData()) return { data: { sessionId: `mock-session-${appointmentId}` } };
    // Try to create — backend returns existing session if one already exists
    // for this appointment (or 200 with the freshly created one).
    const created = await apiFetch<TelehealthSession>("/telehealth", {
      method: "POST",
      body: JSON.stringify({ appointmentId }),
    });
    if (created.data?.id) {
      return { data: { sessionId: created.data.id } };
    }
    if (created.error) {
      return { error: created.error };
    }
    return { error: "Could not open telehealth session." };
  },
};

// ─── Calendar ────────────────────────────────────────────────────────────────

export const calendarService = {
  getLinks: async (appointmentId: string): Promise<ApiResponse<CalendarLinks>> => {
    if (useMockData()) return { data: { google: "#", yahoo: "#", outlook: "#", ical: "#" } };
    return apiFetch<CalendarLinks>(`/appointments/${appointmentId}/calendar-links`);
  },
  generateIcalToken: async (): Promise<ApiResponse<{ token: string; feedUrl: string }>> => {
    if (useMockData()) return { data: { token: "mock_ical_token", feedUrl: "#" } };
    return apiFetch<{ token: string; feedUrl: string }>("/calendar/ical/generate-token");
  },
  googleRedirect: async (): Promise<ApiResponse<{ url: string }>> => {
    if (useMockData()) return { data: { url: "#" } };
    return apiFetch<{ url: string }>("/calendar/google/redirect");
  },
  googleSync: async (appointmentId: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return { data: undefined };
    return apiFetch<void>(`/calendar/google/sync/${appointmentId}`, { method: "POST" });
  },
};

// ─── Master Data ────────────────────────────────────────────────────────────

export const masterDataService = {
  getSpecialties: async (): Promise<ApiResponse<MasterSpecialty[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<MasterSpecialty[]>("/admin/master-data/specialties");
  },
  getSpecialty: async (id: string): Promise<ApiResponse<MasterSpecialty>> => {
    if (useMockData()) return { data: {} as MasterSpecialty };
    return apiFetch<MasterSpecialty>(`/admin/master-data/specialties/${id}`);
  },
  getScreenings: async (): Promise<ApiResponse<ScreeningTemplate[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ScreeningTemplate[]>("/admin/master-data/screenings");
  },
  getConsents: async (): Promise<ApiResponse<ConsentTemplate[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ConsentTemplate[]>("/admin/master-data/consents");
  },
  getStats: async (): Promise<ApiResponse<Record<string, number>>> => {
    if (useMockData()) return { data: {} };
    return apiFetch<Record<string, number>>("/admin/master-data/stats");
  },
};

// ─── Ad-hoc charges ─────────────────────────────────────────────────────────
//
// One-time, non-membership, non-appointment fees the practice bills a
// patient for (form letters, after-hours calls, records copies, etc.).
// Same Stripe Checkout primitive cash-pay bookings use; surface lives
// on the practice side only — patients receive a payment link via email.

export interface AdHocChargeRow {
  id: string;
  patient_id: string;
  description: string;
  notes: string | null;
  line_items: Array<{ description: string; amount_cents: number }>;
  amount_cents: number;
  // Patient credit consumed against this charge (0 when no credit was
  // applied or apply_credit=false). amount_due_cents = what actually
  // hit Stripe Checkout (gross - credit_applied).
  credit_applied_cents?: number;
  amount_due_cents?: number | null;
  currency: string;
  status: "draft" | "sent" | "paid" | "cancelled" | "expired";
  sent_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  created_at: string;
  patient?: { id: string; first_name: string; last_name: string; email: string };
}

export const adHocChargeService = {
  list: async (params?: { patient_id?: string; status?: string }): Promise<ApiResponse<AdHocChargeRow[]>> => {
    if (useMockData()) return { data: [] };
    const q = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiFetch<any>(`/ad-hoc-charges${q}`);
  },
  create: async (data: {
    patientId: string;
    description: string;
    lineItems: Array<{ description: string; amountCents: number }>;
    notes?: string;
    sendEmail?: boolean;
    // Default true server-side. Pass false to bill the patient the full
    // amount even when they have an available credit balance.
    applyCredit?: boolean;
  }): Promise<ApiResponse<{ charge: AdHocChargeRow; checkout_url: string | null; fully_covered_by_credit?: boolean }>> => {
    if (useMockData()) return { data: { charge: {} as AdHocChargeRow, checkout_url: "#" } };
    return apiFetch(`/ad-hoc-charges`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: data.patientId,
        description: data.description,
        // Server expects snake_case; apiFetch only camelCases
        // RESPONSES, not request bodies. line_items is structured so
        // we hand-shape it here.
        line_items: data.lineItems.map((li) => ({
          description: li.description,
          amount_cents: li.amountCents,
        })),
        notes: data.notes,
        send_email: data.sendEmail ?? true,
        apply_credit: data.applyCredit ?? true,
      }),
    });
  },
  cancel: async (id: string): Promise<ApiResponse<AdHocChargeRow>> => {
    if (useMockData()) return { data: {} as AdHocChargeRow };
    return apiFetch<AdHocChargeRow>(`/ad-hoc-charges/${id}/cancel`, { method: "POST" });
  },
  resend: async (id: string): Promise<ApiResponse<{ charge: AdHocChargeRow; checkout_url: string }>> => {
    if (useMockData()) return { data: { charge: {} as AdHocChargeRow, checkout_url: "#" } };
    return apiFetch(`/ad-hoc-charges/${id}/resend`, { method: "POST" });
  },
};

// ─── Patient credits (account balance) ────────────────────────────────────
//
// Per-patient credit ledger — distinct from membership_credits. Applies
// against ad-hoc charges before Stripe Checkout. See PatientCreditService
// docblock on the backend.

export interface PatientCreditApplication {
  id: string;
  amount_applied_cents: number;
  target_type: string;
  target_id: string;
  applied_at: string | null;
}

export interface PatientCreditRow {
  id: string;
  amount_cents: number;
  balance_cents: number;
  currency: string;
  source: "manual" | "refund" | "goodwill" | "overpayment";
  notes: string | null;
  expires_at: string | null;
  voided_at: string | null;
  void_reason?: string | null;
  voided_by_user_id?: string | null;
  created_by_user_id?: string | null;
  created_at: string | null;
  applications: PatientCreditApplication[];
}

export interface PatientCreditSummary {
  balance_cents: number;
  currency: string;
  credits: PatientCreditRow[];
}

export const patientCreditService = {
  // Practice-side — list a specific patient's credits + summary balance.
  list: async (patientId: string): Promise<ApiResponse<PatientCreditSummary>> => {
    if (useMockData()) return { data: { balance_cents: 0, currency: "usd", credits: [] } };
    return apiFetch<PatientCreditSummary>(`/practice/patients/${patientId}/credits`);
  },
  // Practice-side — issue a new credit. Cents-based to match the rest
  // of the money columns. expires_at is YYYY-MM-DD or null.
  issue: async (
    patientId: string,
    data: { amountCents: number; source?: string; notes?: string; expiresAt?: string | null },
  ): Promise<ApiResponse<PatientCreditRow> & { balance_cents?: number }> => {
    if (useMockData()) return { data: {} as PatientCreditRow };
    return apiFetch(`/practice/patients/${patientId}/credits`, {
      method: "POST",
      body: JSON.stringify({
        amount_cents: data.amountCents,
        source: data.source,
        notes: data.notes,
        expires_at: data.expiresAt,
      }),
    });
  },
  // Practice-side — void a credit. Reason is required.
  void: async (
    patientId: string,
    creditId: string,
    reason: string,
  ): Promise<ApiResponse<PatientCreditRow> & { balance_cents?: number }> => {
    if (useMockData()) return { data: {} as PatientCreditRow };
    return apiFetch(`/practice/patients/${patientId}/credits/${creditId}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  // Patient-side — self balance + history (excludes voided).
  mine: async (): Promise<ApiResponse<PatientCreditSummary>> => {
    if (useMockData()) return { data: { balance_cents: 0, currency: "usd", credits: [] } };
    return apiFetch<PatientCreditSummary>(`/me/credits`);
  },
};

// ─── Employer eligible-emails (sponsored-employer allow-list) ─────────────
//
// Pre-enrollment allow-list. The public enrollment widget hashes the
// patient's email and queries this list to decide whether to skip
// Stripe Checkout (sponsored) or charge the card (stripe). HR drops
// employee emails in here ahead of enrollment.

export interface EligibleEmailRow {
  id: string;
  employer_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  claimed_at: string | null;
  claimed_patient_id: string | null;
  removed_at: string | null;
  removed_reason: string | null;
  created_at: string | null;
}

export interface EligibleEmailsSummary {
  data: EligibleEmailRow[];
  meta?: { total: number; pending: number; claimed: number; removed: number };
}

export const employerEligibleEmailService = {
  list: async (employerId: string): Promise<EligibleEmailsSummary> => {
    if (useMockData()) return { data: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiFetch<any>(`/employers/${employerId}/eligible-emails`) as unknown as Promise<EligibleEmailsSummary>;
  },
  add: async (
    employerId: string,
    data: { email: string; firstName?: string; lastName?: string; dateOfBirth?: string },
  ): Promise<ApiResponse<EligibleEmailRow>> => {
    if (useMockData()) return { data: {} as EligibleEmailRow };
    return apiFetch(`/employers/${employerId}/eligible-emails`, {
      method: "POST",
      body: JSON.stringify({
        email: data.email,
        first_name: data.firstName,
        last_name: data.lastName,
        date_of_birth: data.dateOfBirth,
      }),
    });
  },
  bulkAdd: async (
    employerId: string,
    rows: Array<{ email: string; firstName?: string; lastName?: string; dateOfBirth?: string }>,
  ): Promise<ApiResponse<{ added: number; reactivated: number; skipped: number; errors: Array<{ email: string; error: string }> }>> => {
    if (useMockData()) return { data: { added: 0, reactivated: 0, skipped: 0, errors: [] } };
    return apiFetch(`/employers/${employerId}/eligible-emails/bulk`, {
      method: "POST",
      body: JSON.stringify({
        rows: rows.map((r) => ({
          email: r.email,
          first_name: r.firstName,
          last_name: r.lastName,
          date_of_birth: r.dateOfBirth,
        })),
      }),
    });
  },
  remove: async (employerId: string, id: string, reason?: string): Promise<ApiResponse<EligibleEmailRow>> => {
    if (useMockData()) return { data: {} as EligibleEmailRow };
    return apiFetch(`/employers/${employerId}/eligible-emails/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: reason ?? "" }),
    });
  },
};

// ─── Stalled enrollments (recovery / rescue queue) ────────────────────────
//
// Patients who started enrollment but didn't complete payment. Surfaces
// the pending_enrollments table for staff triage. Resend transparently
// refreshes the Stripe session if it's expired.

export interface StalledEnrollmentRow {
  id: string;
  patient_id: string;
  plan_id: string;
  plan_name: string | null;
  plan_monthly_price: number | null;
  plan_annual_price: number | null;
  billing_frequency: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: "pending" | "claimed" | "expired" | "cancelled";
  checkout_url: string | null;
  reminder_count: number;
  last_resent_at: string | null;
  reminders_sent: Record<string, string> | null;
  expires_at: string | null;
  created_at: string | null;
}

export interface StalledEnrollmentsResponse {
  data: StalledEnrollmentRow[];
  meta?: { pending_count: number };
}

export const stalledEnrollmentService = {
  list: async (status?: "pending" | "all" | "cancelled"): Promise<StalledEnrollmentsResponse> => {
    if (useMockData()) return { data: [], meta: { pending_count: 0 } };
    const q = status ? `?status=${status}` : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiFetch<any>(`/practice/pending-enrollments${q}`) as unknown as Promise<StalledEnrollmentsResponse>;
  },
  resend: async (id: string): Promise<ApiResponse<StalledEnrollmentRow> & { checkout_url?: string | null }> => {
    if (useMockData()) return { data: {} as StalledEnrollmentRow };
    return apiFetch(`/practice/pending-enrollments/${id}/resend`, { method: "POST" });
  },
  cancel: async (id: string): Promise<ApiResponse<StalledEnrollmentRow>> => {
    if (useMockData()) return { data: {} as StalledEnrollmentRow };
    return apiFetch<StalledEnrollmentRow>(`/practice/pending-enrollments/${id}/cancel`, { method: "POST" });
  },
};

// ─── Coupons ────────────────────────────────────────────────────────────────

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
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/coupons/${id}`, { method: "DELETE" });
  },
  validate: async (code: string, planId?: string): Promise<ApiResponse<CouponCode>> => {
    if (useMockData()) return { data: {} as CouponCode };
    return apiFetch<CouponCode>("/coupons/validate", { method: "POST", body: JSON.stringify({ code, planId }) });
  },
};

// ─── Notifications ──────────────────────────────────────────────────────────

export const notificationService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<NotificationPreference[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<NotificationPreference[]>(`/notifications${query}`);
  },
  getUnreadCount: async (): Promise<ApiResponse<{ unread_count: number }>> => {
    if (useMockData()) return { data: { unread_count: 0 } };
    return apiFetch<{ unread_count: number }>("/notifications/unread-count");
  },
  markRead: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return { data: undefined };
    return apiFetch<void>(`/notifications/${id}/read`, { method: "PUT" });
  },
  markAllRead: async (): Promise<ApiResponse<void>> => {
    if (useMockData()) return { data: undefined };
    return apiFetch<void>("/notifications/read-all", { method: "POST" });
  },
  // Legacy aliases
  getPreferences: async (): Promise<ApiResponse<NotificationPreference[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<NotificationPreference[]>("/notifications");
  },
  updatePreference: async (id: string, data: Partial<NotificationPreference>): Promise<ApiResponse<NotificationPreference>> => {
    if (useMockData()) return mockUpdate<NotificationPreference>(data);
    return apiFetch<NotificationPreference>(`/notifications/${id}/read`, { method: "PUT", body: JSON.stringify(data) });
  },
};

// ─── External (public, no auth) ─────────────────────────────────────────────

export const externalService = {
  getPlans: async (tenantCode: string): Promise<ApiResponse<MembershipPlan[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<MembershipPlan[]>(`/external/plans/${tenantCode}`);
  },
  enroll: async (tenantCode: string, data: Record<string, unknown>): Promise<ApiResponse<{ patientId: string; membershipId: string }>> => {
    if (useMockData()) return { data: { patientId: "mock_patient", membershipId: "mock_membership" } };
    return apiFetch(`/external/enroll/${tenantCode}`, { method: "POST", body: JSON.stringify(data) });
  },
  getAvailability: async (tenantCode: string): Promise<ApiResponse<ProviderAvailability[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ProviderAvailability[]>(`/external/availability/${tenantCode}`);
  },
};

// Legacy alias for intakeService
export const intakeService = {
  getByTenantCode: async (tenantCode: string): Promise<ApiResponse<{ practice: Practice; plans: MembershipPlan[]; consents: ConsentTemplate[] }>> => {
    if (useMockData()) return { data: { practice: MOCK_PRACTICE, plans: [], consents: [] } };
    return apiFetch(`/external/plans/${tenantCode}`);
  },
  submit: async (tenantCode: string, data: Record<string, unknown>): Promise<ApiResponse<{ patientId: string; membershipId: string }>> => {
    if (useMockData()) return { data: { patientId: "mock_patient", membershipId: "mock_membership" } };
    return apiFetch(`/external/enroll/${tenantCode}`, { method: "POST", body: JSON.stringify(data) });
  },
};

// ─── Dashboard ──────────────────────────────────────────────────────────────

export const dashboardService = {
  getStats: async (): Promise<ApiResponse<DashboardStats>> => {
    if (useMockData()) return { data: MOCK_DASHBOARD };
    return apiFetch<DashboardStats>("/dashboard/practice");
  },
  getPracticeStats: async (): Promise<ApiResponse<DashboardStats>> => {
    if (useMockData()) return { data: MOCK_DASHBOARD };
    return apiFetch<DashboardStats>("/dashboard/practice");
  },
  getPatientStats: async (): Promise<ApiResponse<DashboardStats>> => {
    if (useMockData()) return { data: MOCK_DASHBOARD };
    return apiFetch<DashboardStats>("/dashboard/patient");
  },
};

// ─── Family Members ──────────────────────────────────────────────────────────

export const familyService = {
  list: async (): Promise<ApiResponse<{ id: string; firstName: string; lastName: string; relationship: string; dateOfBirth: string; email?: string; phone?: string; status: string }[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch("/family/members");
  },
  add: async (data: { firstName: string; lastName: string; dateOfBirth: string; relationship: string; email?: string; phone?: string }): Promise<ApiResponse<{ id: string; firstName: string; lastName: string; relationship: string; dateOfBirth: string; status: string }>> => {
    if (useMockData()) return { data: { id: `fm_${Date.now()}`, firstName: data.firstName, lastName: data.lastName, relationship: data.relationship, dateOfBirth: data.dateOfBirth, status: "active" } };
    return apiFetch("/family/members", { method: "POST", body: JSON.stringify(data) });
  },
  remove: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch(`/family/members/${id}`, { method: "DELETE" });
  },
};

// ─── Dunning ────────────────────────────────────────────────────────────────

export const dunningService = {
  list: async (params?: Record<string, string>): Promise<ApiResponse<DunningEvent[]>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<DunningEvent[]>(`/dunning-events${query}`);
  },
};

// ─── Practice → MemberMD Subscription (the practice's own bill) ─────────────
//
// Distinct from membershipService (patient-pays-practice). This surfaces the
// practice's MemberMD subscription tier, usage, billing history, and the
// upgrade/downgrade/cancel flow.

export interface PlatformPlanSummary {
  id: string;
  key: string;
  name: string;
  badgeText?: string | null;
  description?: string | null;
  isQuoteOnly: boolean;
  isPubliclyListed: boolean;
  monthlyPrice: number;
  annualPrice: number | null;
  maxMembers: number | null;
  maxProviders: number | null;
  maxStaff: number | null;
  maxActivePrograms: number | null;
  maxLocations: number | null;
  maxEmployers: number | null;
  apiAccessLevel: "none" | "read" | "full";
  extraSeatBlockSize: number | null;
  extraSeatBlockPrice: number | null;
  features: string[];
  sortOrder: number;
}

export interface PracticeSubscriptionSummary {
  id: string;
  status: "trial" | "active" | "past_due" | "cancelled" | "paused";
  isFounderOverride: boolean;
  trialEndsAt: string | null;
  cancelsAt: string | null;
  plan: PlatformPlanSummary;
  usage: {
    members: number;
    providers: number;
    staff: number;
    programs: number;
    locations: number;
    employers: number;
  };
  effectiveMemberCap?: number | null;
}

export interface PlatformInvoiceRow {
  id: string;
  stripeInvoiceId: string | null;
  stripeInvoiceNumber: string | null;
  amountTotalCents: number;
  amountPaidCents: number;
  status: string;
  issuedAt: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  lineItems: Array<{ type: string; qty?: number; unitPrice?: number; amount?: number }>;
}

export interface CancellationReason {
  id: string;
  label: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}

// SuperAdmin CRUD over platform_plans (the MemberMD tier definitions).
// Distinct from subscriptionService.plans() which is the practice-facing
// "what tiers can I subscribe to" lookup.
export interface PlatformPlanRow extends PlatformPlanSummary {
  cardFeeBps: number;
  cardFeeFlatCents: number;
  achFeeBps: number;
  achFeeFlatCents: number;
  achFeeCapCents: number;
  trialDays: number;
  isActive: boolean;
  stripeMonthlyPriceId: string | null;
  stripeAnnualPriceId: string | null;
  stripeSeatPriceId: string | null;
  subscriptionsCount?: number;
}

export const platformPlanService = {
  list: async (): Promise<ApiResponse<PlatformPlanRow[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PlatformPlanRow[]>("/admin/platform-plans");
  },
  show: async (id: string): Promise<ApiResponse<PlatformPlanRow>> => {
    if (useMockData()) return { data: null as unknown as PlatformPlanRow };
    return apiFetch<PlatformPlanRow>(`/admin/platform-plans/${id}`);
  },
  create: async (data: Partial<PlatformPlanRow>): Promise<ApiResponse<PlatformPlanRow>> => {
    if (useMockData()) return { data: null as unknown as PlatformPlanRow };
    return apiFetch<PlatformPlanRow>("/admin/platform-plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  update: async (id: string, data: Partial<PlatformPlanRow>): Promise<ApiResponse<PlatformPlanRow>> => {
    if (useMockData()) return { data: null as unknown as PlatformPlanRow };
    return apiFetch<PlatformPlanRow>(`/admin/platform-plans/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  destroy: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return { data: undefined };
    return apiFetch<void>(`/admin/platform-plans/${id}`, { method: "DELETE" });
  },
  syncToStripe: async (id: string): Promise<ApiResponse<PlatformPlanRow>> => {
    if (useMockData()) return { data: null as unknown as PlatformPlanRow };
    return apiFetch<PlatformPlanRow>(`/admin/platform-plans/${id}/sync-to-stripe`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};

export const subscriptionService = {
  show: async (): Promise<ApiResponse<PracticeSubscriptionSummary>> => {
    if (useMockData()) return { data: null as unknown as PracticeSubscriptionSummary };
    return apiFetch<PracticeSubscriptionSummary>("/me/subscription");
  },
  plans: async (): Promise<ApiResponse<PlatformPlanSummary[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PlatformPlanSummary[]>("/me/subscription/plans");
  },
  cancellationReasons: async (): Promise<ApiResponse<CancellationReason[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<CancellationReason[]>("/me/subscription/cancellation-reasons");
  },
  invoices: async (): Promise<ApiResponse<PlatformInvoiceRow[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<PlatformInvoiceRow[]>("/me/subscription/invoices");
  },
  // Plan change has two return shapes depending on whether the practice
  // already has a Stripe subscription on file:
  //   - First-time subscriber: `{ checkoutUrl, requiresCheckout: true }`
  //     Frontend redirects browser to Stripe Checkout to collect a card.
  //   - Existing subscriber: `PracticeSubscriptionSummary` (the swapped sub).
  changePlan: async (data: { platformPlanId: string; billingCycle?: "monthly" | "annual" }): Promise<ApiResponse<PracticeSubscriptionSummary | { checkoutUrl: string; requiresCheckout: true }>> => {
    if (useMockData()) return { data: null as unknown as PracticeSubscriptionSummary };
    return apiFetch<PracticeSubscriptionSummary | { checkoutUrl: string; requiresCheckout: true }>("/me/subscription/change", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  cancel: async (data: {
    cancellationReasonId?: string | null;
    cancellationReasonOther?: string | null;
    cancellationNotes?: string | null;
    cancelImmediately?: boolean;
  }): Promise<ApiResponse<PracticeSubscriptionSummary>> => {
    if (useMockData()) return { data: null as unknown as PracticeSubscriptionSummary };
    return apiFetch<PracticeSubscriptionSummary>("/me/subscription/cancel", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  reactivate: async (): Promise<ApiResponse<PracticeSubscriptionSummary>> => {
    if (useMockData()) return { data: null as unknown as PracticeSubscriptionSummary };
    return apiFetch<PracticeSubscriptionSummary>("/me/subscription/reactivate", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  setSeatBlocks: async (blocks: number): Promise<ApiResponse<PracticeSubscriptionSummary>> => {
    if (useMockData()) return { data: null as unknown as PracticeSubscriptionSummary };
    return apiFetch<PracticeSubscriptionSummary>("/me/subscription/seat-blocks", {
      method: "POST",
      body: JSON.stringify({ blocks }),
    });
  },
  redeemCoupon: async (code: string): Promise<ApiResponse<{ code: string; name: string; percentOff: number | null; amountOffCents: number | null; duration: string; durationInMonths: number | null }>> => {
    if (useMockData()) return { data: null as unknown as never };
    return apiFetch("/me/subscription/redeem-coupon", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },
  openBillingPortal: async (): Promise<ApiResponse<{ url: string }>> => {
    if (useMockData()) return { data: null as unknown as never };
    return apiFetch<{ url: string }>("/me/subscription/billing-portal", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};

// ─── Programs (Universal Program Management) ────────────────────────────────

export const programService = {
  // Practice-level
  list: async (): Promise<ApiResponse<Program[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<Program[]>("/programs");
  },
  get: async (id: string): Promise<ApiResponse<Program>> => {
    if (useMockData()) return { data: {} as Program };
    return apiFetch<Program>(`/programs/${id}`);
  },
  create: async (data: Partial<Program>): Promise<ApiResponse<Program>> => {
    if (useMockData()) return mockCreate<Program>(data);
    return apiFetch<Program>("/programs", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: Partial<Program>): Promise<ApiResponse<Program>> => {
    if (useMockData()) return mockUpdate<Program>(data);
    return apiFetch<Program>(`/programs/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/programs/${id}`, { method: "DELETE" });
  },
  enrollPatient: async (programId: string, data: { patientId: string; planId?: string; fundingSource?: string; sponsorName?: string; assignedProviderId?: string | null }): Promise<ApiResponse<ProgramEnrollment>> => {
    if (useMockData()) return mockCreate<ProgramEnrollment>(data as Partial<ProgramEnrollment>);
    return apiFetch<ProgramEnrollment>(`/programs/${programId}/enroll`, { method: "POST", body: JSON.stringify(data) });
  },
  unenrollPatient: async (programId: string, enrollmentId: string, data?: { reason?: string }): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/programs/${programId}/unenroll/${enrollmentId}`, { method: "POST", body: JSON.stringify(data || {}) });
  },
  // Patch an enrollment in place — today only used to (re)assign the
  // primary provider on a patient's enrollment in this program. The
  // backend rejects providers not attached to the program.
  updateEnrollment: async (programId: string, enrollmentId: string, data: { assignedProviderId?: string | null }): Promise<ApiResponse<ProgramEnrollment>> => {
    if (useMockData()) return mockUpdate<ProgramEnrollment>(data as Partial<ProgramEnrollment>);
    return apiFetch<ProgramEnrollment>(`/programs/${programId}/enrollments/${enrollmentId}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  // Patient self-service: list the caller's own active enrollments
  // with assigned + bookable providers for each. Drives the booking
  // widget's program-scoped picker.
  myEnrollments: async (): Promise<ApiResponse<unknown[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<unknown[]>("/me/enrollments");
  },
  // Staff-side counterpart to myEnrollments — used by the booking
  // widget when mounted in staff mode. Same payload shape; the SPA
  // can route through one parser regardless of mode.
  patientEnrollments: async (patientId: string): Promise<ApiResponse<unknown[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<unknown[]>(`/patients/${patientId}/enrollments`);
  },
  addProvider: async (programId: string, data: { providerId: string; role?: string; panelCapacity?: number }): Promise<ApiResponse<ProgramProvider>> => {
    if (useMockData()) return mockCreate<ProgramProvider>(data);
    return apiFetch<ProgramProvider>(`/programs/${programId}/providers`, { method: "POST", body: JSON.stringify(data) });
  },
  removeProvider: async (programId: string, providerId: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/programs/${programId}/providers/${providerId}`, { method: "DELETE" });
  },
  // Eligibility rules — practice admins manage who qualifies for the
  // program from the Settings tab. Backend stores `value` as JSON so
  // the same row can carry a tuple (between), array (in / not_in),
  // or scalar (equals / greater_than) without per-rule_type tables.
  addRule: async (
    programId: string,
    data: {
      ruleType: string;
      operator?: string;
      value: unknown;
      description?: string | null;
      isRequired?: boolean;
    },
  ): Promise<ApiResponse<Record<string, unknown>>> => {
    if (useMockData()) return mockCreate<Record<string, unknown>>(data as Record<string, unknown>);
    return apiFetch<Record<string, unknown>>(`/programs/${programId}/rules`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateRule: async (
    programId: string,
    ruleId: string,
    data: Partial<{
      ruleType: string;
      operator: string | null;
      value: unknown;
      description: string | null;
      isRequired: boolean;
    }>,
  ): Promise<ApiResponse<Record<string, unknown>>> => {
    if (useMockData()) return mockUpdate<Record<string, unknown>>(data as Record<string, unknown>);
    return apiFetch<Record<string, unknown>>(`/programs/${programId}/rules/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  removeRule: async (programId: string, ruleId: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/programs/${programId}/rules/${ruleId}`, { method: "DELETE" });
  },
  stats: async (programId: string): Promise<ApiResponse<Record<string, unknown>>> => {
    if (useMockData()) return { data: {} };
    return apiFetch<Record<string, unknown>>(`/programs/${programId}/stats`);
  },

  // SuperAdmin master templates
  listTemplates: async (): Promise<ApiResponse<Program[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<Program[]>("/admin/master-data/programs");
  },
  getTemplate: async (id: string): Promise<ApiResponse<Program>> => {
    if (useMockData()) return { data: {} as Program };
    return apiFetch<Program>(`/admin/master-data/programs/${id}`);
  },
  createTemplate: async (data: Partial<Program>): Promise<ApiResponse<Program>> => {
    if (useMockData()) return mockCreate<Program>(data);
    return apiFetch<Program>("/admin/master-data/programs", { method: "POST", body: JSON.stringify(data) });
  },
  updateTemplate: async (id: string, data: Partial<Program>): Promise<ApiResponse<Program>> => {
    if (useMockData()) return mockUpdate<Program>(data);
    return apiFetch<Program>(`/admin/master-data/programs/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  provisionTemplate: async (id: string, practiceId: string): Promise<ApiResponse<Program>> => {
    if (useMockData()) return mockCreate<Program>({ id, isTemplate: false });
    return apiFetch<Program>(`/admin/master-data/programs/${id}/provision`, { method: "POST", body: JSON.stringify({ practiceId }) });
  },
};

// ─── Lab Orders ──────────────────────────────────────────────────────────────
// LabOrderController::index returns a Laravel-paginated envelope —
// { data: { data: [...], current_page, total } } — and includes the
// nested `results` relation when patient (or other) callers fetch.
// Patient role is auto-scoped server-side to caller's own labs (see
// LabOrderController commit ae3010c... actually d6bd33a → tier 2),
// so no patient_id filter needed when role=patient.

// Lab orders backed by /lab-orders. Encounter detail uses create() to
// add new orders inline; index() is filtered by encounter_id from the
// caller.
export const labService = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list: async (params?: Record<string, string>): Promise<ApiResponse<any>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiFetch<any>(`/lab-orders${query}`);
  },
  // Used by the encounter detail "Order labs" mini-form. Backend
  // requires patient_id, provider_id, panels[{code,name}], priority.
  // encounter_id is optional but always sent from this UI so the
  // order shows up under the encounter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: async (data: Record<string, unknown>): Promise<ApiResponse<any>> => {
    if (useMockData()) return { data: { id: "mock-lab", ...data } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiFetch<any>("/lab-orders", { method: "POST", body: JSON.stringify(data) });
  },
};

// Referrals backed by /referrals. Same pattern as labs — encounter
// detail page surfaces existing referrals + offers an inline "New
// referral" form. Referrals are HIPAA-sensitive (referred-to PHI),
// always tenant-scoped server-side.
export const referralService = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list: async (params?: Record<string, string>): Promise<ApiResponse<any>> => {
    if (useMockData()) return { data: [] };
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiFetch<any>(`/referrals${query}`);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: async (data: Record<string, unknown>): Promise<ApiResponse<any>> => {
    if (useMockData()) return { data: { id: "mock-ref", ...data } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiFetch<any>("/referrals", { method: "POST", body: JSON.stringify(data) });
  },
};

// ===== Engagement Service =====

export const engagementService = {
  listCampaigns: async (params?: Record<string, string>): Promise<ApiResponse<EngagementCampaign[]>> => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    if (useMockData()) return { data: [] };
    return apiFetch<EngagementCampaign[]>(`/engagement/campaigns${query}`);
  },
  createCampaign: async (data: Partial<EngagementCampaign>): Promise<ApiResponse<EngagementCampaign>> => {
    if (useMockData()) return mockCreate<EngagementCampaign>(data);
    return apiFetch<EngagementCampaign>("/engagement/campaigns", { method: "POST", body: JSON.stringify(data) });
  },
  updateCampaign: async (id: string, data: Partial<EngagementCampaign>): Promise<ApiResponse<EngagementCampaign>> => {
    if (useMockData()) return mockUpdate<EngagementCampaign>(data);
    return apiFetch<EngagementCampaign>(`/engagement/campaigns/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  deleteCampaign: async (id: string): Promise<ApiResponse<void>> => {
    if (useMockData()) return mockDelete();
    return apiFetch<void>(`/engagement/campaigns/${id}`, { method: "DELETE" });
  },
  getAtRiskPatients: async (params?: Record<string, string>): Promise<ApiResponse<PatientEngagementScore[]>> => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    if (useMockData()) return { data: [] };
    return apiFetch<PatientEngagementScore[]>(`/engagement/at-risk-patients${query}`);
  },
  getPatientScore: async (patientId: string): Promise<ApiResponse<PatientEngagementScore>> => {
    if (useMockData()) return { data: {} as PatientEngagementScore };
    return apiFetch<PatientEngagementScore>(`/engagement/patient/${patientId}/score`);
  },
  getPatientLogs: async (patientId: string): Promise<ApiResponse<EngagementAnalyticsSummary>> => {
    if (useMockData()) return { data: {} as EngagementAnalyticsSummary };
    return apiFetch<EngagementAnalyticsSummary>(`/engagement/patient/${patientId}/logs`);
  },
  getAnalyticsSummary: async (): Promise<ApiResponse<EngagementAnalyticsSummary>> => {
    if (useMockData()) return { data: { totalPatients: 0, atRiskPatients: 0, highEngagement: 0, averageEngagementScore: 0, activeCampaigns: 0, recentLogs: [] } };
    return apiFetch<EngagementAnalyticsSummary>("/engagement/analytics-summary");
  },
};

// ===== Provider Analytics Service =====

export const providerAnalyticsService = {
  getProviderRevenue: async (providerId: string): Promise<ApiResponse<ProviderRevenueMetrics>> => {
    if (useMockData()) return { data: {} as ProviderRevenueMetrics };
    return apiFetch<ProviderRevenueMetrics>(`/analytics/providers/${providerId}/revenue`);
  },
  getProviderPanel: async (providerId: string): Promise<ApiResponse<ProviderPatientPanel>> => {
    if (useMockData()) return { data: {} as ProviderPatientPanel };
    return apiFetch<ProviderPatientPanel>(`/analytics/providers/${providerId}/patient-panel`);
  },
  getProvidersSummary: async (): Promise<ApiResponse<ProviderSummaryItem[]>> => {
    if (useMockData()) return { data: [] };
    return apiFetch<ProviderSummaryItem[]>("/analytics/providers-summary");
  },
  getPerformanceComparison: async (): Promise<ApiResponse<PracticePerformanceMetrics>> => {
    if (useMockData()) return { data: { practiceMetrics: { totalUniquePatients: 0, appointmentsCompleted: 0, noShows: 0, cancellations: 0, completionRatePercent: 0, noShowRatePercent: 0 } } };
    return apiFetch<PracticePerformanceMetrics>("/analytics/performance-comparison");
  },
};

// ===== Enhanced Billing Services =====

export const billingEnhancedService = {
  // PDF Invoice
  getInvoicePdfUrl: (invoiceId: string, download?: boolean): string => {
    const base = `${API_BASE_URL}/invoices/${invoiceId}/pdf`;
    const params = new URLSearchParams();
    if (download) params.set("download", "1");
    const token = getAuthToken();
    if (token) params.set("token", token);
    return params.toString() ? `${base}?${params}` : base;
  },

  // Proration Preview
  previewPlanChange: async (membershipId: string, planId: string): Promise<ApiResponse<Record<string, unknown>>> => {
    if (useMockData()) return { data: { oldPlanName: "Essential", newPlanName: "Complete", credit: 33.00, charge: 66.33, net: 33.33, daysRemaining: 10, totalDays: 30, isUpgrade: true, description: "Upgrade from Essential to Complete: prorated charge of $33.33" } };
    return apiFetch<Record<string, unknown>>(`/memberships/${membershipId}/preview-plan-change`, { method: "POST", body: JSON.stringify({ planId }) });
  },

  // Smart Retry
  smartRetry: async (membershipId: string): Promise<ApiResponse<Record<string, unknown>>> => {
    if (useMockData()) return { data: { success: false, reason: "mock_mode", nextRetryAt: new Date(Date.now() + 86400000).toISOString(), retriesRemaining: 3 } };
    return apiFetch<Record<string, unknown>>(`/dunning/${membershipId}/smart-retry`, { method: "POST" });
  },
  getRetryAnalytics: async (): Promise<ApiResponse<Record<string, unknown>>> => {
    if (useMockData()) return { data: { totalDunningEvents: 0, recovered: 0, pending: 0, exhaustedRetries: 0, recoveryRatePercent: 0, avgAttemptsToRecover: 0, maxRetries: 4, upcomingRetries: [], retrySchedule: { 1: 1, 2: 3, 3: 7, 4: 14 }, preferredRetryDays: ["Tuesday", "Wednesday", "Thursday"] } };
    return apiFetch<Record<string, unknown>>("/dunning/retry-analytics");
  },

  // Retention Offers
  getRetentionOffers: async (membershipId: string, reason: string): Promise<ApiResponse<Record<string, unknown>>> => {
    if (useMockData()) return { data: { offers: [{ type: "pause", title: "Pause your membership", description: "Take a break for up to 3 months.", cta: "Pause Instead" }, { type: "downgrade", title: "Switch to Essential", description: "Save $100/month.", cta: "Switch to Essential", planId: "p1", planPrice: 99, monthlySavings: 100 }], currentPlan: { name: "Complete", monthlyPrice: 199 }, reason } };
    return apiFetch<Record<string, unknown>>(`/memberships/${membershipId}/retention-offers`, { method: "POST", body: JSON.stringify({ reason }) });
  },
};

// ===== Stripe Connect Service =====

export type StripeConnectStatus =
  | "not_started"
  | "pending_onboarding"
  | "pending_verification"
  | "restricted"
  | "active"
  | "disconnected";

export interface StripeConnectStatusResponse {
  practiceId: string;
  stripeAccountId: string | null;
  status: StripeConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: Record<string, unknown> | null;
  disabledReason: string | null;
  onboardedAt: string | null;
  platformFeePercent: number;
  canAcceptPayments: boolean;
}

export const stripeConnectService = {
  status: async (): Promise<ApiResponse<StripeConnectStatusResponse>> => {
    if (useMockData()) {
      return {
        data: {
          practiceId: "p1",
          stripeAccountId: null,
          status: "not_started",
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: null,
          disabledReason: null,
          onboardedAt: null,
          platformFeePercent: 0,
          canAcceptPayments: false,
        },
      };
    }
    return apiFetch<StripeConnectStatusResponse>("/stripe/connect/status");
  },

  createOnboardingLink: async (): Promise<ApiResponse<{ url: string; expiresInSeconds: number }>> => {
    return apiFetch<{ url: string; expiresInSeconds: number }>("/stripe/connect/onboarding-link", { method: "POST" });
  },

  // Mint a short-lived AccountSession for the embedded Connect components
  // (@stripe/connect-js). Frontend uses { client_secret, publishable_key }
  // to instantiate loadConnectAndInitialize() and render onboarding inline.
  createAccountSession: async (): Promise<ApiResponse<{ clientSecret: string; publishableKey: string | null; account: string }>> => {
    return apiFetch<{ clientSecret: string; publishableKey: string | null; account: string }>(
      "/stripe/connect/account-session",
      { method: "POST" },
    );
  },

  createDashboardLink: async (): Promise<ApiResponse<{ url: string }>> => {
    return apiFetch<{ url: string }>("/stripe/connect/dashboard-link", { method: "POST" });
  },

  refresh: async (): Promise<ApiResponse<StripeConnectStatusResponse>> => {
    return apiFetch<StripeConnectStatusResponse>("/stripe/connect/refresh", { method: "POST" });
  },

  disconnect: async (): Promise<ApiResponse<StripeConnectStatusResponse>> => {
    return apiFetch<StripeConnectStatusResponse>("/stripe/connect", { method: "DELETE" });
  },
};

// ===== Onboarding Service (first-mile helpers) =====
// Closes the gap between fresh practice signup and "ready to enroll a
// patient": fork specialty starter plans, create sample patients to
// click through the UI, mark the dashboard onboarding banner dismissed.

export const onboardingService = {
  /** Fork specialty default_plan_templates → real MembershipPlan rows. */
  forkStarterPlans: async (
    options: { specialtyCode?: string; planIndices?: number[] } = {},
  ): Promise<ApiResponse<{ created: number; skipped: number; plans: unknown[] }>> => {
    return apiFetch("/practice/starter-plans", {
      method: "POST",
      body: JSON.stringify(options),
    });
  },

  /** Create a Stripe-style sample patient (max 5 per tenant). */
  createSamplePatient: async (): Promise<ApiResponse<{ patient: unknown; sampleCount: number; isSample: boolean }>> => {
    return apiFetch("/practice/sample-patient", { method: "POST" });
  },

  /** Bulk-remove every sample patient for the current tenant. */
  removeAllSamplePatients: async (): Promise<ApiResponse<{ deleted: number }>> => {
    return apiFetch("/practice/sample-patients", { method: "DELETE" });
  },

  /** Dismiss the dashboard onboarding banner. */
  completeOnboarding: async (): Promise<ApiResponse<{ onboardingCompleted: boolean }>> => {
    return apiFetch("/practice/onboarding/complete", { method: "POST" });
  },
};

// ===== Operator Service (multi-practice operators) =====

export type OperatorRoleApi = "owner" | "admin" | "viewer";

export interface OperatorMe {
  operator: {
    id: string;
    name: string;
    slug: string;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    defaultBranding: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
    isActive: boolean;
    tenantCount: number;
    createdAt: string;
  };
  role: OperatorRoleApi;
  canWrite: boolean;
  canManageUsers: boolean;
  tenantIds: string[];
  activeTenantId: string | null;
}

export interface OperatorTenant {
  id: string;
  name: string;
  slug: string;
  specialty: string | null;
  practiceModel: string | null;
  tenantCode: string;
  city: string | null;
  state: string | null;
  isActive: boolean;
  subscriptionStatus: string | null;
  stripeConnectStatus: string | null;
  stripeChargesEnabled: boolean;
  logoUrl: string | null;
  primaryColor: string | null;
  patientCount: number | null;
  providerCount: number | null;
  userCount: number | null;
  createdAt: string;
}

export interface OperatorNetworkSnapshot {
  mrrCents: number;
  arrCents: number;
  arpuCents: number;
  memberCount: number;
  patientCount: number;
  churnRate: number;
  newMembers: number;
  cancelled: number;
  tenantCount: number;
  activeTenantCount: number;
}

export interface OperatorNetworkDeltas {
  mrrCentsDelta: number;
  mrrPctChange: number | null;
  memberCountDelta: number;
  memberPctChange: number | null;
  arpuCentsDelta: number;
  churnRateDelta: number;
  newMembersDelta: number;
}

export interface OperatorNetworkMetrics {
  current: OperatorNetworkSnapshot;
  prior: OperatorNetworkSnapshot;
  deltas: OperatorNetworkDeltas;
  windowDays: number;
  asOf: string;
}

export interface OperatorTimeBucket {
  bucket: string; // YYYY-MM-DD or YYYY-MM
  mrrCents: number;
  memberCount: number;
  newMembers: number;
  cancelled: number;
}

export interface OperatorTimeseries {
  granularity: "daily" | "monthly" | "both";
  daily?: OperatorTimeBucket[];
  monthly?: OperatorTimeBucket[];
}

export interface OperatorCohortPoint {
  cohort: string; // YYYY-MM
  monthsAged: number;
  cohortSize: number;
  stillActive: number;
  retentionRate: number | null;
}

export interface OperatorClinicDetail {
  tenant: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    specialty: string | null;
    tenantCode: string;
    isActive: boolean;
    subscriptionStatus: string | null;
    stripeConnectStatus: string | null;
    stripeChargesEnabled: boolean;
    patientCount: number;
    createdAt: string;
  };
  snapshot: OperatorNetworkMetrics;
  daily: OperatorTimeBucket[];
  monthly: OperatorTimeBucket[];
}

export interface OperatorClinicMetric {
  tenantId: string;
  name: string;
  city: string | null;
  state: string | null;
  isActive: boolean;
  mrrCents: number;
  mrrCents30dAgo: number;
  growthRate30d: number | null;
  memberCount: number;
  newMembers30d: number;
  cancelled30d: number;
  churnRate30d: number;
  patientCount: number;
  arpuCents: number;
  stripeConnectStatus: string | null;
}

export interface OperatorMember {
  patientId: string;
  tenantId: string;
  tenantName: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
}

export interface OperatorUserMembership {
  id: string;
  userId: string;
  operatorRole: OperatorRoleApi;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  addedAt: string;
}

export const operatorService = {
  me: async (): Promise<ApiResponse<OperatorMe>> => {
    return apiFetch<OperatorMe>("/operator/me");
  },

  tenants: async (): Promise<ApiResponse<OperatorTenant[]>> => {
    return apiFetch<OperatorTenant[]>("/operator/tenants");
  },

  createTenant: async (input: {
    name: string;
    slug: string;
    tenantCode: string;
    timezone: string;
    specialty?: string | null;
    practiceModel?: string | null;
    email?: string | null;
    phone?: string | null;
  }): Promise<ApiResponse<{ tenant: OperatorTenant; provisioning: Record<string, unknown> }>> => {
    // Backend expects snake_case; apiFetch transforms responses but
    // not requests, so map here.
    return apiFetch<{ tenant: OperatorTenant; provisioning: Record<string, unknown> }>("/operator/tenants", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        slug: input.slug,
        tenant_code: input.tenantCode,
        timezone: input.timezone,
        specialty: input.specialty ?? null,
        practice_model: input.practiceModel ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
      }),
    });
  },

  show: async (): Promise<ApiResponse<OperatorMe["operator"]>> => {
    return apiFetch<OperatorMe["operator"]>("/operator");
  },

  update: async (data: Partial<OperatorMe["operator"]>): Promise<ApiResponse<OperatorMe["operator"]>> => {
    return apiFetch<OperatorMe["operator"]>("/operator", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  listUsers: async (): Promise<ApiResponse<OperatorUserMembership[]>> => {
    return apiFetch<OperatorUserMembership[]>("/operator/users");
  },

  addUser: async (input: { email: string; operatorRole: OperatorRoleApi }): Promise<ApiResponse<OperatorUserMembership>> => {
    return apiFetch<OperatorUserMembership>("/operator/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  removeUser: async (userId: string): Promise<ApiResponse<{ message: string }>> => {
    return apiFetch<{ message: string }>(`/operator/users/${userId}`, {
      method: "DELETE",
    });
  },

  network: async (): Promise<ApiResponse<OperatorNetworkMetrics>> => {
    return apiFetch<OperatorNetworkMetrics>("/operator/analytics/network");
  },

  clinics: async (): Promise<ApiResponse<OperatorClinicMetric[]>> => {
    return apiFetch<OperatorClinicMetric[]>("/operator/analytics/clinics");
  },

  clinicDetail: async (tenantId: string): Promise<ApiResponse<OperatorClinicDetail>> => {
    return apiFetch<OperatorClinicDetail>(`/operator/analytics/clinics/${tenantId}`);
  },

  timeseries: async (
    granularity: "daily" | "monthly" | "both" = "both",
    opts: { days?: number; months?: number } = {},
  ): Promise<ApiResponse<OperatorTimeseries>> => {
    const params = new URLSearchParams({ granularity });
    if (opts.days) params.set("days", String(opts.days));
    if (opts.months) params.set("months", String(opts.months));
    return apiFetch<OperatorTimeseries>(`/operator/analytics/timeseries?${params.toString()}`);
  },

  cohortRetention: async (months = 12): Promise<ApiResponse<OperatorCohortPoint[]>> => {
    return apiFetch<OperatorCohortPoint[]>(`/operator/analytics/cohort-retention?months=${months}`);
  },

  searchMembers: async (q: string, limit = 25): Promise<ApiResponse<OperatorMember[]>> => {
    return apiFetch<OperatorMember[]>(`/operator/members/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  },

  switchTenant: async (tenantId: string): Promise<ApiResponse<{ activeTenantId: string }>> => {
    return apiFetch<{ activeTenantId: string }>("/auth/switch-tenant", {
      method: "POST",
      body: JSON.stringify({ tenantId }),
    });
  },
};

// ===== Master Plan Templates =====

export type TemplateStatus = "draft" | "published" | "archived";

export const LOCKABLE_TEMPLATE_FIELDS = [
  "name",
  "description",
  "badge_text",
  "monthly_price",
  "annual_price",
  "visits_per_month",
  "telehealth_included",
  "messaging_included",
  "messaging_response_sla_hours",
  "crisis_support",
  "lab_discount_pct",
  "prescription_management",
  "specialist_referrals",
  "care_plan_included",
  "visit_rollover",
  "overage_fee",
  "family_eligible",
  "family_member_price",
  "min_commitment_months",
  "features_list",
] as const;

export type LockableField = typeof LOCKABLE_TEMPLATE_FIELDS[number];

export interface MasterPlanTemplate {
  id: string;
  operatorId: string;
  name: string;
  slug: string;
  description: string | null;
  badgeText: string | null;
  defaultMonthlyPrice: number;
  defaultAnnualPrice: number | null;
  defaultVisitsPerMonth: number;
  defaultTelehealthIncluded: boolean;
  defaultMessagingIncluded: boolean;
  defaultMessagingResponseSlaHours: number | null;
  defaultCrisisSupport: boolean;
  defaultLabDiscountPct: number | null;
  defaultPrescriptionManagement: boolean;
  defaultSpecialistReferrals: boolean;
  defaultCarePlanIncluded: boolean;
  defaultVisitRollover: boolean;
  defaultOverageFee: number | null;
  defaultFamilyEligible: boolean;
  defaultFamilyMemberPrice: number | null;
  defaultMinCommitmentMonths: number | null;
  defaultFeaturesList: string[] | null;
  lockedFields: LockableField[];
  monthlyPriceMin: number | null;
  monthlyPriceMax: number | null;
  annualPriceMin: number | null;
  annualPriceMax: number | null;
  status: TemplateStatus;
  version: number;
  plansCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanFieldState {
  locked: boolean;
  overridden: boolean;
  templateDefault: unknown;
  currentValue: unknown;
  monthlyPriceMin?: number | null;
  monthlyPriceMax?: number | null;
  annualPriceMin?: number | null;
  annualPriceMax?: number | null;
}

export type PlanFieldStates = Partial<Record<LockableField, PlanFieldState>>;

export const masterPlanTemplateService = {
  list: async (status?: TemplateStatus): Promise<ApiResponse<MasterPlanTemplate[]>> => {
    const qs = status ? `?status=${status}` : "";
    return apiFetch<MasterPlanTemplate[]>(`/operator/plan-templates${qs}`);
  },

  show: async (id: string): Promise<ApiResponse<MasterPlanTemplate>> => {
    return apiFetch<MasterPlanTemplate>(`/operator/plan-templates/${id}`);
  },

  create: async (data: Partial<MasterPlanTemplate>): Promise<ApiResponse<MasterPlanTemplate>> => {
    return apiFetch<MasterPlanTemplate>("/operator/plan-templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<MasterPlanTemplate>): Promise<ApiResponse<MasterPlanTemplate>> => {
    return apiFetch<MasterPlanTemplate>(`/operator/plan-templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  archive: async (id: string): Promise<ApiResponse<{ message: string }>> => {
    return apiFetch<{ message: string }>(`/operator/plan-templates/${id}`, {
      method: "DELETE",
    });
  },

  publish: async (id: string): Promise<ApiResponse<MasterPlanTemplate>> => {
    return apiFetch<MasterPlanTemplate>(`/operator/plan-templates/${id}/publish`, {
      method: "POST",
    });
  },

  applyToTenant: async (
    id: string,
    tenantId: string,
    replacePlanId?: string,
  ): Promise<ApiResponse<Record<string, unknown>>> => {
    return apiFetch<Record<string, unknown>>(`/operator/plan-templates/${id}/apply-to/${tenantId}`, {
      method: "POST",
      body: JSON.stringify(replacePlanId ? { replacePlanId } : {}),
    });
  },

  syncAll: async (id: string): Promise<ApiResponse<{ templateId: string; plansSynced: number }>> => {
    return apiFetch<{ templateId: string; plansSynced: number }>(
      `/operator/plan-templates/${id}/sync-all`,
      { method: "POST" }
    );
  },
};

// ===== Tenant-side template helpers (extends membershipPlanService) =====

export const planTemplateService = {
  fieldStates: async (planId: string): Promise<ApiResponse<PlanFieldStates>> => {
    return apiFetch<PlanFieldStates>(`/membership-plans/${planId}/field-states`);
  },

  resetToTemplate: async (planId: string, fields?: string[]): Promise<ApiResponse<Record<string, unknown>>> => {
    return apiFetch<Record<string, unknown>>(`/membership-plans/${planId}/reset-to-template`, {
      method: "POST",
      body: JSON.stringify(fields ? { fields } : {}),
    });
  },

  syncFromTemplate: async (planId: string): Promise<ApiResponse<Record<string, unknown>>> => {
    return apiFetch<Record<string, unknown>>(`/membership-plans/${planId}/sync-from-template`, {
      method: "POST",
    });
  },

  detach: async (planId: string): Promise<ApiResponse<Record<string, unknown>>> => {
    return apiFetch<Record<string, unknown>>(`/membership-plans/${planId}/detach-template`, {
      method: "POST",
    });
  },
};

// ===== Branded Widgets — Custom Domains + Themes + Analytics =====

export type SslStatus = "pending" | "active" | "failed";

export interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string;
  verificationToken: string;
  verificationMethod: "txt" | "manual";
  verifiedAt: string | null;
  isVerified: boolean;
  sslStatus: SslStatus;
  isPrimary: boolean;
  isActive: boolean;
  txtRecordHost: string;
  txtRecordValue: string;
  createdAt: string;
}

export const tenantDomainService = {
  list: async (): Promise<ApiResponse<TenantDomain[]>> => {
    return apiFetch<TenantDomain[]>("/tenant-domains");
  },

  add: async (domain: string): Promise<ApiResponse<TenantDomain>> => {
    return apiFetch<TenantDomain>("/tenant-domains", {
      method: "POST",
      body: JSON.stringify({ domain }),
    });
  },

  verify: async (id: string): Promise<ApiResponse<TenantDomain>> => {
    return apiFetch<TenantDomain>(`/tenant-domains/${id}/verify`, { method: "POST" });
  },

  makePrimary: async (id: string): Promise<ApiResponse<TenantDomain>> => {
    return apiFetch<TenantDomain>(`/tenant-domains/${id}/primary`, { method: "POST" });
  },

  release: async (id: string): Promise<ApiResponse<{ message: string }>> => {
    return apiFetch<{ message: string }>(`/tenant-domains/${id}`, { method: "DELETE" });
  },
};

export type WidgetThemeScope = "all" | "enrollment" | "plans" | "booking";

export interface WidgetTheme {
  id?: string;
  tenantId: string;
  scope: WidgetThemeScope;
  cssVariables: Record<string, string>;
  customCss: string | null;
  fontFamily: string | null;
  logo: { url?: string; position?: string; maxHeight?: number } | null;
  isActive: boolean;
  isDefault?: boolean;
}

export const widgetThemeService = {
  list: async (): Promise<ApiResponse<WidgetTheme[]>> => {
    return apiFetch<WidgetTheme[]>("/widget-themes");
  },

  show: async (scope: WidgetThemeScope): Promise<ApiResponse<WidgetTheme>> => {
    return apiFetch<WidgetTheme>(`/widget-themes/${scope}`);
  },

  upsert: async (scope: WidgetThemeScope, data: Partial<WidgetTheme>): Promise<ApiResponse<WidgetTheme>> => {
    return apiFetch<WidgetTheme>(`/widget-themes/${scope}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  reset: async (scope: WidgetThemeScope): Promise<ApiResponse<{ message: string }>> => {
    return apiFetch<{ message: string }>(`/widget-themes/${scope}`, { method: "DELETE" });
  },
};

export interface WidgetAnalyticsTypeStats {
  impressions: number;
  starts: number;
  completes: number;
  errors: number;
  startRate: number;
  conversionRate: number;
  overallRate: number;
}

export interface WidgetAnalyticsSummary {
  windowDays: number;
  byWidgetType: Record<string, WidgetAnalyticsTypeStats>;
}

export const widgetAnalyticsService = {
  summary: async (days = 30, widgetType?: string): Promise<ApiResponse<WidgetAnalyticsSummary>> => {
    const qs = new URLSearchParams({ days: String(days) });
    if (widgetType) qs.set("widget_type", widgetType);
    return apiFetch<WidgetAnalyticsSummary>(`/widget-analytics/summary?${qs}`);
  },

  /**
   * Public ingest used by embedded widgets — no auth.
   * Beacon-style fire-and-forget; returns silently.
   */
  trackEvent: async (
    tenantCode: string,
    widgetType: "enrollment" | "plans" | "booking",
    eventType: "impression" | "start" | "complete" | "error",
    extra: { sessionId?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<void> => {
    try {
      await fetch(`${API_BASE_URL}/public/widget/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        keepalive: true,
        body: JSON.stringify({
          tenant_code: tenantCode,
          widget_type: widgetType,
          event_type: eventType,
          session_id: extra.sessionId,
          utm_source: extra.utmSource,
          utm_medium: extra.utmMedium,
          utm_campaign: extra.utmCampaign,
          metadata: extra.metadata,
        }),
      });
    } catch {
      // Analytics failures must never break the widget
    }
  },
};

// Public theme fetch — used by widgets to apply branded styles
export interface PublicWidgetTheme {
  tenantCode: string;
  practiceName: string;
  logoUrl: string | null;
  cssVariables: Record<string, string>;
  customCss: string | null;
  fontFamily: string | null;
  logo: { url?: string; position?: string; maxHeight?: number } | null;
}

export async function fetchPublicWidgetTheme(
  tenantCode: string,
  scope: WidgetThemeScope = "all",
): Promise<PublicWidgetTheme | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/widget/${tenantCode}/theme?scope=${scope}`);
    if (!res.ok) return null;
    const json = await res.json();
    return transformKeys<PublicWidgetTheme>(json.data ?? json, snakeToCamel);
  } catch {
    return null;
  }
}
