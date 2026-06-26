// Backend HTTP client. Base URL comes from VITE_API_BASE; falls back to the
// docker-compose default so `bun dev` works against a locally-running stack.
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "http://localhost:8000/api";

export const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  "ws://localhost:8000/ws/queue/";

export function wsUrlWithToken(): string {
  const token = authToken ?? window.localStorage.getItem("helix.auth") ?? window.sessionStorage.getItem("helix.auth") ?? "";
  return token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Pull a human-readable message out of an ApiError. DRF endpoints return
// {"error": "..."} (our custom guards), {"detail": "..."}, or field-keyed
// {"field": ["msg"]} / {"non_field_errors": ["msg"]}.
export function apiErrorMessage(error: unknown, fallback = "Something went wrong."): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const body = error.body as Record<string, unknown>;
    if (typeof body.error === "string") return body.error;
    if (typeof body.detail === "string") return body.detail;
    const first = Object.values(body)[0];
    const msg = Array.isArray(first) ? first[0] : first;
    if (typeof msg === "string") return msg;
  }
  return error instanceof Error ? error.message || fallback : fallback;
}

let authToken: string | null = null;
if (typeof window !== "undefined") {
  authToken =
    window.localStorage.getItem("helix.auth") ||
    window.sessionStorage.getItem("helix.auth") ||
    null;
}

// persist=true  → localStorage (survives tab close — "remember me" behaviour)
// persist=false → sessionStorage (cleared when the tab closes)
export function setAuthToken(token: string | null, persist = true) {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      if (persist) {
        window.localStorage.setItem("helix.auth", token);
        window.sessionStorage.removeItem("helix.auth");
      } else {
        window.sessionStorage.setItem("helix.auth", token);
        window.localStorage.removeItem("helix.auth");
      }
    } else {
      window.localStorage.removeItem("helix.auth");
      window.sessionStorage.removeItem("helix.auth");
    }
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (res.status === 401) {
    setAuthToken(null);
    if (typeof window !== "undefined") {
      // Dispatch a custom event so the AuthGuard in __root__.tsx can handle the
      // redirect via client-side navigation rather than a full page reload.
      window.dispatchEvent(new CustomEvent("session:expired"));
    }
    throw new ApiError(401, body, "Session expired");
  }
  if (!res.ok) {
    throw new ApiError(res.status, body, `${res.status} ${res.statusText}`);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Types — mirror services/queue/core/serializers.py ──────────────────────
export interface DashboardStats {
  avg_wait_minutes: number;
  avg_service_minutes: number;
  completed_in_window: number;
  window_hours: number;
  total_waiting: number;
  total_in_progress: number;
  active_counters: number;
  total_counters: number;
  bottlenecks: Array<Record<string, unknown>>;
}

export interface Counter {
  id: number;
  name: string;
  location_description: string | null;
  is_active: boolean;
  service_types: number[];
  queue_depth: number;
  current_token: string | null;
  next_tokens: string[];
}

export type ServiceKind = "CONSULTATION" | "DIAGNOSTIC";

export interface ServiceType {
  id: number;
  name: string;
  // CONSULTATION = doctor/department visit, DIAGNOSTIC = test. Drives the two
  // checkbox groups in the registration dialog. (services/queue/core/models.py)
  kind?: ServiceKind;
  prefix?: string;
  average_service_time_minutes?: number;
  [key: string]: unknown;
}

export interface Token {
  id: number;
  number: string;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  service_type: number | null;
  service_type_name: string | null;
  counter: number | null;
  counter_name: string | null;
  patient_name: string;
  phone_number: string;
  created_at: string;
  service_start_at: string | null;
  completed_at: string | null;
  actual_wait_minutes: number | null;
  visit_id: number | null;
}

export type DoctorStatus = "AVAILABLE" | "DELAYED" | "ON_LEAVE" | "EMERGENCY";

export interface Doctor {
  id: number;
  name: string;
  service_type: number;
  service_type_name: string;
  status: DoctorStatus;
  delay_minutes: number;
  notes: string;
  updated_at: string;
  is_available: boolean;
}

export interface EscalationAlert {
  id: number;
  rule_name: string;
  threshold_type: "QUEUE_DEPTH" | "AVG_WAIT";
  counter_name: string | null;
  service_type_name: string | null;
  triggered_value: number;
  message: string;
  created_at: string;
  acknowledged_at: string | null;
  is_acknowledged: boolean;
}

export interface RegisterPayload {
  patient_name: string;
  phone_number: string;
  service_type_id: number;
  medical_notes?: string;
  is_simulated?: boolean;
}

// Mirrors the 201 body of POST /api/queue/register/ (services/queue/core/views.py).
export interface VisitToken {
  id: number;
  number: string;
  service_type_name: string;
  counter_name: string | null;
  status: Token["status"];
  created_at: string;
  service_start_at: string | null;
  completed_at: string | null;
  actual_wait_minutes: number | null;
}

export interface PatientVisit {
  id: number;
  patient_id: string;
  patient_name: string;
  created_at: string;
  notes: string;
  tokens: VisitToken[];
}

export interface TransferResult {
  visit_id: number;
  new_token_number: string;
  service_type: string;
  counter: string;
  directions: string;
}

export interface RegisterResult {
  patient_id: string;
  visit_id: number;
  token_number: string;
  counter: string;
  estimated_wait_minutes: number;
  directions: string;
  medical_notes: string;
}

// Multi-service registration: one token per selected consultation/test.
// service_type_ids = CONSULTATION kinds, test_ids = DIAGNOSTIC kinds.
export interface RegisterMultiPayload {
  patient_name: string;
  phone_number: string;
  service_type_ids: number[];
  test_ids: number[];
  medical_notes?: string;
  is_simulated?: boolean;
}

// One entry in the register-multi token bundle (services/queue/core/views.py:247).
export interface MultiToken {
  token_number: string;
  service_type_id: number;
  service_type_name: string;
  kind: ServiceKind;
  counter: string;
  counter_location: string;
  directions: string;
  queue_depth: number;
}

export interface RegisterMultiResult {
  patient_id: string;
  visit_id: number;
  tokens: MultiToken[];
}

// ── Endpoints ──────────────────────────────────────────────────────────────
export const api = {
  health: () => request<{ status: string }>("/healthz/"),
  dashboard: () => request<DashboardStats>("/stats/dashboard/"),
  counters: () => request<Counter[]>("/counters/"),
  serviceTypes: () => request<ServiceType[]>("/service-types/"),
  register: (payload: RegisterPayload) =>
    request<RegisterResult>("/queue/register/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  registerMulti: (payload: RegisterMultiPayload) =>
    request<RegisterMultiResult>("/queue/register-multi/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  tokens: (status?: Token["status"]) =>
    request<Token[]>(`/queue/tokens/${status ? `?status=${status}` : ""}`),
  callNext: (counterId: number) =>
    request<Token>("/queue/call_next/", {
      method: "POST",
      body: JSON.stringify({ counter_id: counterId }),
    }),
  // Backend identifies tokens by their number (e.g. "GEN-156"), not the DB id.
  complete: (tokenNumber: string) =>
    request<Token>(`/queue/${tokenNumber}/complete/`, { method: "POST" }),
  noShow: (tokenNumber: string) =>
    request<Token>(`/queue/${tokenNumber}/no_show/`, { method: "POST" }),
  setCounterActive: (counterId: number, isActive: boolean) =>
    request<Counter>(`/counters/${counterId}/set_active/`, {
      method: "POST",
      body: JSON.stringify({ is_active: isActive }),
    }),
  login: (username: string, password: string) =>
    request<{ access: string; refresh: string }>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  alerts: () => request<EscalationAlert[]>("/alerts/"),
  acknowledgeAlert: (id: number) =>
    request<EscalationAlert>(`/alerts/${id}/acknowledge/`, { method: "POST" }),
  transfer: (tokenNumber: string, targetServiceTypeId: number) =>
    request<TransferResult>("/queue/transfer/", {
      method: "POST",
      body: JSON.stringify({ token_number: tokenNumber, target_service_type_id: targetServiceTypeId }),
    }),
  journey: (visitId: number) =>
    request<PatientVisit>(`/queue/journey/?visit_id=${visitId}`),
  journeyByToken: (tokenNumber: string) =>
    request<PatientVisit>(`/queue/journey/?token_number=${encodeURIComponent(tokenNumber)}`),
  doctors: () => request<Doctor[]>("/doctors/"),
  setDoctorStatus: (id: number, payload: { status: DoctorStatus; delay_minutes?: number; notes?: string }) =>
    request<Doctor>(`/doctors/${id}/set_status/`, { method: "POST", body: JSON.stringify(payload) }),
};
