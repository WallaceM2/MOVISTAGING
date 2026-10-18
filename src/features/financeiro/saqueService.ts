import { apiFetch, idempotencyKey } from "@/api/http";

export type PayoutAccount = {
  tipo_chave_pix: "cpf" | "email" | "telefone" | "aleatoria";
  chave_pix_mascarada: string;
  conta_mascarada: string | null;
  pin_configurado: boolean;
  atualizado_em: string;
};

export type PayoutSetup = {
  conta: PayoutAccount | null;
  saques_habilitados: false;
  provedor: string;
};

export type PayoutAccountInput = {
  tipo_chave_pix: PayoutAccount["tipo_chave_pix"];
  chave_pix: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo_conta: "corrente" | "poupanca" | "pagamento";
};

export function getPayoutSetup() {
  return apiFetch<PayoutSetup>("/api/motoristas/recebimento");
}

export function savePayoutAccount(data: PayoutAccountInput) {
  return apiFetch<PayoutSetup>("/api/motoristas/recebimento", {
    method: "PUT",
    body: JSON.stringify(data),
    idempotencyKey: idempotencyKey("driver-payout-account"),
  });
}

export function saveWithdrawalPin(pin: string, currentPin?: string) {
  return apiFetch<{ pin_configurado: boolean; saques_habilitados: false }>("/api/motoristas/saques/pin", {
    method: "PUT",
    body: JSON.stringify({ pin_atual: currentPin || undefined, novo_pin: pin }),
    idempotencyKey: idempotencyKey("driver-withdrawal-pin"),
  });
}
