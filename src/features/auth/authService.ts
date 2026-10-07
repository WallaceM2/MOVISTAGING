import { apiFetch, refreshAccessToken } from '@/api/http';
import { tokenStore } from '@/auth/tokenStore';
import { useAuthStore } from '@/store/authStore';
import type { AuthResponse, Passenger, RegistrationInput } from '@/types/api';
import { disableRideNotifications } from '@/notifications/notifications';

export async function login(email: string, senha: string) {
  const body = await apiFetch<AuthResponse>('/api/passageiros/login', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), senha }), retryAuth: false });
  await tokenStore.setRefreshToken(body.refresh_token);
  useAuthStore.getState().setSession(body.token, { ...body.passageiro });
  return body;
}

export async function restoreSession() {
  const ok = await refreshAccessToken();
  if (!ok) return false;
  const profile = await import('@/features/perfil/profileService').then((m) => m.getProfile());
  useAuthStore.getState().setPassenger(profile.passageiro);
  return true;
}

export async function register(input: RegistrationInput) {
  return apiFetch<{ mensagem: string; passageiro: Passenger }>('/api/passageiros', { method: 'POST', body: JSON.stringify(input), retryAuth: false });
}

export async function logout() {
  const refreshToken = await tokenStore.getRefreshToken();
  try {
    await disableRideNotifications().catch(() => undefined);
    if (refreshToken) {await apiFetch('/api/auth/logout', {method: 'POST',body: JSON.stringify({ refresh_token: refreshToken }),retryAuth: false,idempotencyKey: `logout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,});
}
  } finally {
    await tokenStore.clear();
    useAuthStore.getState().clearSession();
  }
}

export async function changePassword(senha_atual: string, nova_senha: string) {
  return apiFetch<{ sucesso: boolean; mensagem: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ senha_atual, nova_senha }),
    idempotencyKey: `change-password-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  });
}
