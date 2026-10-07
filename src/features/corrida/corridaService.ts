import { apiFetch, idempotencyKey } from "@/api/http";

export type RideStatus = "solicitada" | "aceita" | "em_andamento" | "concluida" | "cancelada" | "expirada";
export type RideOffer = {
  corrida_id: number;
  origem: string;
  destino: string;
  origem_lat: number;
  origem_lng: number;
  destino_lat: number;
  destino_lng: number;
  valor: number | string;
  ganho_motorista: number | string;
  forma_pagamento: "dinheiro" | "cartao" | "pix";
  categoria: "moto" | "carro";
  distancia_km: number | string;
  distancia_ate_origem_km?: number | string;
  tempo_minutos: number | string;
  expira_em?: string;
};

export type Ride = RideOffer & {
  id: number;
  passageiro_id: number;
  motorista_id: number | null;
  status: RideStatus;
  codigo_embarque?: string;
  status_pagamento?: "pago" | "parcial" | "nao_pago" | "pendente";
  valor_recebido_motorista?: number | string | null;
  criado_em?: string;
  finalizada_em?: string | null;
  passageiro?: {
    id: number;
    nome: string;
    nota_media: number | string;
    total_avaliacoes: number;
    conta_verificada: boolean;
  } | null;
};

export type DriverStatement = {
  saldo_total: string | null;
  ganhos_acumulados: string | null;
  total_viagens: number;
  corridas_concluidas: number;
  valor_total_corridas: string;
  historico: Array<Pick<Ride, "id" | "origem" | "destino" | "valor" | "ganho_motorista" | "forma_pagamento" | "status" | "status_pagamento" | "criado_em" | "finalizada_em">>;
  pagina: { limit: number; offset: number };
};

export async function getOffers() {
  const response = await apiFetch<{ ofertas: RideOffer[] }>("/api/corridas/ofertas");
  return response.ofertas ?? [];
}

export function acceptRide(id: number) {
  return apiFetch<{ mensagem: string; corrida: Ride }>(`/api/corridas/${id}/aceitar`, {
    method: "POST",
    idempotencyKey: idempotencyKey(`ride-${id}-accept`),
  });
}

export function rejectRide(id: number) {
  return apiFetch<{ mensagem: string; corrida_id: number }>(`/api/corridas/${id}/recusar`, {
    method: "POST",
    idempotencyKey: idempotencyKey(`ride-${id}-reject`),
  });
}

export function getRide(id: number) {
  return apiFetch<Ride>(`/api/corridas/${id}`);
}

export function startRide(id: number, codigoEmbarque: string) {
  return apiFetch<{ mensagem: string; corrida: Ride }>(`/api/corridas/${id}/iniciar`, {
    method: "POST",
    body: JSON.stringify({ codigo_embarque: codigoEmbarque }),
    idempotencyKey: idempotencyKey(`ride-${id}-start`),
  });
}

export function finishRide(id: number, payment: { status_pagamento: "pago" | "parcial" | "nao_pago"; valor_recebido_motorista?: number; observacao_pagamento?: string }) {
  return apiFetch<{ mensagem: string; corrida: Ride; financeiro: { sucesso: boolean } }>(`/api/corridas/${id}/finalizar`, {
    method: "POST",
    body: JSON.stringify(payment),
    idempotencyKey: idempotencyKey(`ride-${id}-finish`),
  });
}

export function cancelRide(id: number) {
  return apiFetch<{ mensagem: string; corrida: Ride }>(`/api/corridas/${id}/cancelar`, {
    method: "POST",
    idempotencyKey: idempotencyKey(`ride-${id}-cancel`),
  });
}

export function getDriverStatement(limit = 30, offset = 0) {
  return apiFetch<DriverStatement>(`/api/extrato?limit=${limit}&offset=${offset}`);
}

export function reportPassenger(input: { rideId: number; passengerId: number; motivo: "direcao_perigosa" | "assedio" | "agressao" | "roubo" | "fraude" | "outro"; descricao?: string }) {
  return apiFetch<{ mensagem: string; denuncia: { id: number; status: string }; bloqueio_automatico: boolean }>("/api/denuncias", {
    method: "POST",
    body: JSON.stringify({ corrida_id: input.rideId, denunciado_id: input.passengerId, motivo: input.motivo, descricao: input.descricao?.trim() || undefined }),
    idempotencyKey: idempotencyKey(`ride-${input.rideId}-report`),
  });
}
