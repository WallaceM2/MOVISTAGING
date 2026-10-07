import { apiFetch } from "@/api/http";
import { tokenStore } from "@/auth/tokenStore";
import { useAuthStore, type Driver } from "@/store/authStore";
import { disableRideNotifications } from "@/features/push/pushService";

export type RegistrationInput = {
  nome: string;
  sobrenome: string;
  email: string;
  telefone: string;
  senha: string;
  data_nascimento: string;
  cpf: string;
  rg?: string;
  cnh?: string;
  categoria_cnh?: string;
  estado: string;
  cidade?: string;
  regiao?: string;
  categoria: "moto" | "carro";
  placa_veiculo: string;
  marca_veiculo: string;
  modelo_veiculo: string;
  cor_veiculo: string;
  ano_modelo_veiculo: number;
  aceita_termos: true;
};

type LoginResponse = { token: string; refresh_token: string; motorista: Driver };

export async function login(email: string, senha: string) {
  const response = await apiFetch<LoginResponse>("/api/motoristas/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), senha }),
    retryAuth: false,
  });
  if (!response.token || !response.refresh_token || !response.motorista?.id) {
    throw new Error("O servidor retornou uma resposta de acesso inválida.");
  }
  await tokenStore.setRefreshToken(response.refresh_token);
  useAuthStore.getState().setSession(response.token, response.motorista);
  return response;
}

export function registerDriver(input: RegistrationInput) {
  return apiFetch<{ mensagem: string; motorista: Driver }>("/api/motoristas", {
    method: "POST",
    body: JSON.stringify(input),
    retryAuth: false,
  });
}

export async function logout() {
  const refreshToken = await tokenStore.getRefreshToken();
  try {
    await disableRideNotifications().catch(() => undefined);
    if (refreshToken) {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
        idempotencyKey: `logout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`,
        retryAuth: false,
      });
    }
  } finally {
    await tokenStore.clear();
    useAuthStore.getState().clearSession();
  }
}
