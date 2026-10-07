import { API_URL, REQUEST_TIMEOUT_MS } from "@/config/env";
import { tokenStore } from "@/auth/tokenStore";
import { useAuthStore } from "@/store/authStore";

type ApiErrorShape = { erro?: string; mensagem?: string; codigo?: string; request_id?: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly requestId?: string) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshInFlight: Promise<boolean> | null = null;

function requestId() {
  return `movi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function idempotencyKey(scope: string) {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

async function parseBody(response: Response) {
  const raw = await response.text();
  if (!raw) return undefined;
  try { return JSON.parse(raw) as unknown; } catch { return undefined; }
}

export async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await tokenStore.getRefreshToken();
    if (!refreshToken) return false;
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Request-Id": requestId() },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal,
      });
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401 || response.status === 403) {
      await tokenStore.clear();
      useAuthStore.getState().clearSession();
      return false;
    }
    if (!response.ok) return false;
    const body = await parseBody(response) as { token?: string; refresh_token?: string } | undefined;
    if (!body?.token || !body.refresh_token) return false;
    await tokenStore.setRefreshToken(body.refresh_token);
    useAuthStore.getState().setSession(body.token);
    return true;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function restoreSession() {
  const refreshed = await refreshAccessToken();
  if (!refreshed) return false;
  try {
    const response = await apiFetch<{ motorista: import("@/store/authStore").Driver }>("/api/motoristas/perfil", { retryAuth: false });
    useAuthStore.getState().setDriver(response.motorista);
    return true;
  } catch {
    await tokenStore.clear();
    useAuthStore.getState().clearSession();
    return false;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit & { idempotencyKey?: string; retryAuth?: boolean } = {}): Promise<T> {
  const { idempotencyKey: key, retryAuth = true, headers: suppliedHeaders, ...requestOptions } = options;
  const headers = new Headers(suppliedHeaders);
  headers.set("Accept", "application/json");
  headers.set("X-Request-Id", requestId());
  if (requestOptions.body && !(requestOptions.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (key) headers.set("Idempotency-Key", key);

  const send = async (retry: boolean): Promise<T> => {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...requestOptions,
        headers,
        signal: requestOptions.signal ?? controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new ApiError("O servidor demorou para responder. Tente novamente.", 408, "TIMEOUT");
      throw new ApiError("Sem conexão com o servidor. Verifique sua internet e tente novamente.", 0, "NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401 && retry && retryAuth && path !== "/api/auth/refresh") {
      if (await refreshAccessToken()) return send(false);
    }
    const body = await parseBody(response);
    if (!response.ok) {
      const error = (body && typeof body === "object" ? body : {}) as ApiErrorShape;
      throw new ApiError(error.erro ?? error.mensagem ?? "Não foi possível concluir a operação.", response.status, error.codigo, error.request_id);
    }
    return body as T;
  };

  return send(true);
}
