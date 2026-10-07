import { API_URL, REQUEST_TIMEOUT_MS } from '@/config/env';
import { tokenStore } from '@/auth/tokenStore';
import { useAuthStore } from '@/store/authStore';
import type { ApiErrorShape } from '@/types/api';

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  requestId: string | undefined;
  details: ApiErrorShape['detalhes'] | undefined;

  constructor(message: string, status: number, shape: ApiErrorShape = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = shape.codigo;
    this.requestId = shape.request_id;
    this.details = shape.detalhes;
  }
}

let refreshPromise: Promise<boolean> | null = null;

function createRequestId(): string {
  return `movi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await tokenStore.getRefreshToken();
    if (!refreshToken) return false;
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Request-Id': createRequestId() },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      await tokenStore.clear();
      useAuthStore.getState().clearSession();
      return false;
    }
    const body = await response.json() as { token: string; refresh_token: string };
    if (!body.token || !body.refresh_token) throw new Error('Resposta de renovação de sessão inválida.');
    await tokenStore.setRefreshToken(body.refresh_token);
    useAuthStore.getState().setSession(body.token);
    return true;
  })().catch(async () => {
    await tokenStore.clear();
    useAuthStore.getState().clearSession();
    return false;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'AbortError';
}

export async function apiFetch<T>(path: string, options: RequestInit & { idempotencyKey?: string; retryAuth?: boolean } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const { idempotencyKey, retryAuth = true, headers: suppliedHeaders, ...requestOptions } = options;
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(suppliedHeaders);
  headers.set('Accept', 'application/json');
  if (requestOptions.body && !(requestOptions.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('X-Request-Id', createRequestId());
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  try {
    const response = await fetch(`${API_URL}${path}`, { ...requestOptions, headers, signal: controller.signal });
    if (response.status === 401 && retryAuth && path !== '/api/auth/refresh') {
      const refreshed = await refreshAccessToken();
      if (refreshed) return apiFetch<T>(path, { ...options, retryAuth: false });
    }
    const text = await response.text();
    let body: unknown = undefined;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
    if (!response.ok) {
      const shape = (body && typeof body === 'object' ? body : {}) as ApiErrorShape;
      if (shape.codigo === 'LEGAL_CONSENT_REQUIRED') useAuthStore.getState().setRequiresLegalConsent(true);
      throw new ApiError(shape.erro ?? shape.mensagem ?? 'Não foi possível concluir a operação.', response.status, shape);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isAbortError(error)) throw new ApiError('Tempo limite de conexão excedido.', 408, { codigo: 'TIMEOUT' });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
