import { apiFetch } from '@/api/http';
import { createIdempotencyKey } from '@/utils/idempotency';

export function settleDebt() {
  return apiFetch<{ mensagem: string }>('/api/passageiros/quitar-debito', {
    method: 'POST',
    idempotencyKey: createIdempotencyKey('debito-quitar'),
  });
}

export type CashDebt = {
  corrida_id: number;
  origem: string;
  destino: string;
  forma_pagamento: string;
  finalizada_em: string | null;
  valor_devido: number | string;
  valor_recebido: number | string;
  diferenca_debito: number | string;
  saldo_pendente: number | string;
  resposta_passageiro: 'pendente' | 'confirmada' | 'contestada' | 'prazo_esgotado';
  prazo_resposta_em: string;
  resposta_em: string | null;
  contestacao_descricao: string | null;
  suporte_chamado_id: number | null;
  resposta_prevista_min_em: string | null;
  resposta_prevista_max_em: string | null;
};

export type CancellationFee = {
  corrida_id: number;
  origem: string;
  destino: string;
  valor: number | string;
  status: 'pendente' | 'contestada' | 'liquidada' | 'cancelada';
  repasse_status: 'creditado_carteira' | 'liquidado';
  creditado_carteira_em: string;
  aceita_em: string;
  cancelada_em: string;
  criado_em: string;
  contestacao_descricao: string | null;
  suporte_chamado_id: number | null;
  resposta_prevista_min_em: string | null;
  resposta_prevista_max_em: string | null;
};

export function getCashDebts() {
  return apiFetch<{ debitos: CashDebt[]; taxas_cancelamento: CancellationFee[]; total_pendente: number }>('/api/passageiros/debitos');
}

export function respondToCashDebt(rideId: number, decision: { decisao: 'confirmar' } | { decisao: 'contestar'; descricao: string }) {
  return apiFetch<{ mensagem: string; corrida_id: number; resposta_passageiro: string; suporte_chamado_id?: number; saldo_alterado?: false }>(
    `/api/passageiros/debitos/${rideId}/resposta`,
    { method: 'POST', body: JSON.stringify(decision), idempotencyKey: createIdempotencyKey(`debito-${rideId}-${decision.decisao}`) },
  );
}

export function contestCancellationFee(rideId: number, descricao: string) {
  return apiFetch<{ mensagem: string; corrida_id: number; status: string; suporte_chamado_id: number; debito_preservado: true }>(
    `/api/passageiros/taxas-cancelamento/${rideId}/contestar`,
    { method: 'POST', body: JSON.stringify({ descricao }), idempotencyKey: createIdempotencyKey(`taxa-cancelamento-${rideId}-contestar`) },
  );
}
