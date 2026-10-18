import { apiFetch } from "@/api/http";

export type RecoveryMethod = "email" | "sms";
export async function requestPasswordRecovery(method: RecoveryMethod, destination: string) {
  return apiFetch<{ challengeId: string; mensagem: string }>("/api/auth/password-recovery/request", {
    method: "POST", body: JSON.stringify({ tipo_usuario: "motorista", metodo: method, destino: destination.trim() }), retryAuth: false,
  });
}
export async function verifyPasswordRecoveryCode(challengeId: string, code: string) {
  return apiFetch<{ token_recuperacao: string }>("/api/auth/password-recovery/verify", {
    method: "POST", body: JSON.stringify({ challenge_id: challengeId, codigo: code }), retryAuth: false,
  });
}
export async function resetPasswordWithRecovery(challengeId: string, token: string, password: string) {
  return apiFetch<{ sucesso: boolean; mensagem: string }>("/api/auth/password-recovery/reset", {
    method: "POST", body: JSON.stringify({ challenge_id: challengeId, token_recuperacao: token, nova_senha: password }), retryAuth: false,
  });
}
